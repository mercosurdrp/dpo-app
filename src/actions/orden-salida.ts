"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  getEmpleadoIdFromAuth,
  requireAuth,
  requireRole,
} from "@/lib/session"
import type {
  AsignacionCamionDiario,
  CamionFlota,
  EmpleadoOrdenSalida,
  EstadoCamionDiario,
  MiOrdenDelDia,
  MotivoNoSale,
  PersonalNoSaleDiario,
  SucursalOrdenSalida,
} from "@/types/database"
import { fechaQueVeElEmpleado } from "@/lib/orden-salida-fechas"
import { IS_MISIONES } from "@/lib/empresa"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

const ROLES_EDITOR = ["admin", "admin_rrhh", "supervisor"] as const

// ============================================================================
// Catálogos: empleados activos del módulo + flota
// ============================================================================
export async function listarEmpleadosOrdenSalida(): Promise<
  Result<EmpleadoOrdenSalida[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // empleados con sucursal cargada (= los que aplican al módulo)
    const { data: empleados, error } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector, puesto, sucursal, activo")
      .not("sucursal", "is", null)
      .order("nombre")
    if (error) return { error: error.message }

    // titulares: empleado_id → patente (catalogo_vehiculos.dominio)
    const { data: titulares, error: errT } = await supabase
      .from("orden_salida_titulares")
      .select("empleado_id, camion:catalogo_vehiculos!orden_salida_titulares_camion_id_fkey(dominio)")
    if (errT) return { error: errT.message }

    const titularPorEmp = new Map<string, string>()
    for (const t of (titulares ?? []) as unknown as Array<{
      empleado_id: string
      camion: { dominio: string } | null
    }>) {
      if (t.camion?.dominio) titularPorEmp.set(t.empleado_id, t.camion.dominio)
    }

    const out: EmpleadoOrdenSalida[] = (empleados ?? []).map((e) => ({
      id: e.id as string,
      legajo: (e.legajo as number | null) ?? null,
      nombre: e.nombre as string,
      sector: (e.sector as string | null) ?? null,
      puesto: (e.puesto as string | null) ?? null,
      sucursal: (e.sucursal as SucursalOrdenSalida | null) ?? null,
      activo: Boolean(e.activo),
      camion_fijo_patente: titularPorEmp.get(e.id as string) ?? null,
    }))

    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function listarFlota(): Promise<Result<CamionFlota[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_flota")
      .select(
        `vehiculo_id, sucursal, capacidad_kg, numero_unidad, activo,
         vehiculo:catalogo_vehiculos!orden_salida_flota_vehiculo_id_fkey(dominio)`
      )
      .eq("activo", true)
      .order("sucursal")
    if (error) return { error: error.message }

    const flota: CamionFlota[] = ((data ?? []) as unknown as Array<{
      vehiculo_id: string
      sucursal: SucursalOrdenSalida
      capacidad_kg: number | null
      numero_unidad: number | null
      activo: boolean
      vehiculo: { dominio: string } | null
    }>).map((r) => ({
      id: r.vehiculo_id,
      patente: r.vehiculo?.dominio ?? "",
      sucursal: r.sucursal,
      capacidad_kg: r.capacidad_kg,
      numero_unidad: r.numero_unidad,
      activo: r.activo,
    }))
    return { data: flota }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Asignaciones diarias por camión
// ============================================================================
export async function obtenerAsignaciones(
  fecha: string
): Promise<Result<AsignacionCamionDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_camion_diario")
      .select("*")
      .eq("fecha", fecha)
    if (error) return { error: error.message }
    return { data: (data ?? []) as AsignacionCamionDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function obtenerAsignacionesEnRango(
  desde: string,
  hasta: string
): Promise<Result<AsignacionCamionDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_camion_diario")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
    if (error) return { error: error.message }
    return { data: (data ?? []) as AsignacionCamionDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function obtenerNoSaleEnRango(
  desde: string,
  hasta: string
): Promise<Result<PersonalNoSaleDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_personal_no_sale")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
    if (error) return { error: error.message }
    return { data: (data ?? []) as PersonalNoSaleDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export interface AsignacionInput {
  fecha: string
  camion_id: string
  chofer_empleado_id?: string | null
  ayudante_empleado_id?: string | null
  zona?: string
  estado?: EstadoCamionDiario
  observacion?: string
  clientes?: number | null
  sobrecarga_completa?: number | null
  media_sobrecarga?: number | null
  cuarto_sobrecarga?: number | null
  bultos?: number | null
}

export async function upsertAsignacion(input: AsignacionInput): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()

    if (!input.fecha || !input.camion_id) {
      return { error: "Fecha y camión son obligatorios" }
    }

    // Si el estado pasa a algo distinto de "operativo", limpiamos tripulación
    // (consistente con la regla del cliente).
    const limpiar = input.estado && input.estado !== "operativo"
    const row = {
      fecha: input.fecha,
      camion_id: input.camion_id,
      chofer_empleado_id: limpiar ? null : input.chofer_empleado_id ?? null,
      ayudante_empleado_id: limpiar ? null : input.ayudante_empleado_id ?? null,
      zona: input.zona ?? "",
      estado: input.estado ?? "sin_asignar",
      observacion: input.observacion ?? "",
      clientes: input.clientes ?? null,
      sobrecarga_completa: input.sobrecarga_completa ?? null,
      media_sobrecarga: input.media_sobrecarga ?? null,
      cuarto_sobrecarga: input.cuarto_sobrecarga ?? null,
      bultos: input.bultos ?? null,
    }

    const { error } = await supabase
      .from("orden_salida_camion_diario")
      .upsert(row, { onConflict: "fecha,camion_id" })
    if (error) return { error: error.message }

    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarAsignacion(
  fecha: string,
  camionId: string
): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("orden_salida_camion_diario")
      .delete()
      .eq("fecha", fecha)
      .eq("camion_id", camionId)
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Personal que no sale
// ============================================================================
export async function obtenerNoSale(
  fecha: string
): Promise<Result<PersonalNoSaleDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_personal_no_sale")
      .select("*")
      .eq("fecha", fecha)
    if (error) return { error: error.message }
    return { data: (data ?? []) as PersonalNoSaleDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export interface NoSaleInput {
  fecha: string
  empleado_id: string
  motivo: MotivoNoSale
  detalle?: string
}

export async function upsertNoSale(input: NoSaleInput): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("orden_salida_personal_no_sale")
      .upsert(
        {
          fecha: input.fecha,
          empleado_id: input.empleado_id,
          motivo: input.motivo,
          detalle: input.detalle ?? "",
        },
        { onConflict: "fecha,empleado_id" }
      )
    if (error) return { error: error.message }

    // Si el empleado estaba en alguna asignación de ese día, sacarlo.
    const { error: errClean } = await supabase
      .from("orden_salida_camion_diario")
      .update({ chofer_empleado_id: null })
      .eq("fecha", input.fecha)
      .eq("chofer_empleado_id", input.empleado_id)
    if (errClean) return { error: errClean.message }
    const { error: errClean2 } = await supabase
      .from("orden_salida_camion_diario")
      .update({ ayudante_empleado_id: null })
      .eq("fecha", input.fecha)
      .eq("ayudante_empleado_id", input.empleado_id)
    if (errClean2) return { error: errClean2.message }

    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function quitarNoSale(
  fecha: string,
  empleadoId: string
): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("orden_salida_personal_no_sale")
      .delete()
      .eq("fecha", fecha)
      .eq("empleado_id", empleadoId)
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Padrón: alta y anular/reactivar
// ============================================================================
export interface NuevoEmpleadoInput {
  nombre: string
  sucursal: SucursalOrdenSalida
  puesto: "Chofer" | "Ayudante" | "Depósito"
  legajo?: number | null
}

export async function agregarEmpleado(
  input: NuevoEmpleadoInput
): Promise<Result<{ id: string }>> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const nombre = input.nombre.trim().toUpperCase()
    if (!nombre) return { error: "El nombre es obligatorio" }

    const { data, error } = await supabase
      .from("empleados")
      .insert({
        nombre,
        sucursal: input.sucursal,
        puesto: input.puesto,
        sector: "Distribución",
        legajo: input.legajo ?? null,
        activo: true,
        numero_id: "", // se completa después si corresponde
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function setEmpleadoActivo(
  empleadoId: string,
  activo: boolean
): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("empleados")
      .update({ activo })
      .eq("id", empleadoId)
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function obtenerMiOrdenSalida(): Promise<Result<MiOrdenDelDia>> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) {
      return { error: "Tu usuario no está vinculado a un empleado." }
    }
    const fecha = fechaQueVeElEmpleado()
    const supabase = await createClient()

    // 1) ¿Está en una asignación de camión ese día?
    const { data: asig, error: errAsig } = await supabase
      .from("orden_salida_camion_diario")
      .select(
        `fecha, zona, observacion, chofer_empleado_id, ayudante_empleado_id,
         camion:catalogo_vehiculos!orden_salida_camion_diario_camion_id_fkey(dominio)`
      )
      .eq("fecha", fecha)
      .or(`chofer_empleado_id.eq.${empleadoId},ayudante_empleado_id.eq.${empleadoId}`)
      .limit(1)
      .maybeSingle()
    if (errAsig) return { error: errAsig.message }
    if (asig) {
      const a = asig as unknown as {
        fecha: string
        zona: string
        observacion: string
        chofer_empleado_id: string | null
        ayudante_empleado_id: string | null
        camion: { dominio: string } | null
      }
      return {
        data: {
          tipo: "asignacion",
          fecha: a.fecha,
          rol: a.chofer_empleado_id === empleadoId ? "chofer" : "ayudante",
          camion_patente: a.camion?.dominio ?? "",
          zona: a.zona ?? "",
          observacion: a.observacion ?? "",
        },
      }
    }

    // 2) ¿Está en la lista de "no sale"?
    const { data: no, error: errNo } = await supabase
      .from("orden_salida_personal_no_sale")
      .select("fecha, motivo, detalle")
      .eq("fecha", fecha)
      .eq("empleado_id", empleadoId)
      .maybeSingle()
    if (errNo) return { error: errNo.message }
    if (no) {
      return {
        data: {
          tipo: "no_sale",
          fecha: no.fecha as string,
          motivo: no.motivo as MotivoNoSale,
          detalle: (no.detalle as string) ?? "",
        },
      }
    }

    // 3) Sin definir
    return { data: { tipo: "sin_definir", fecha } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Sincronización desde Google Sheets (solo Misiones)
// Fuente: https://docs.google.com/spreadsheets/d/1dJZG46JXlEMZGI8PSogBrIcB2P8oR0dYuxknQPYy7jU
//   - Hoja FORMACIÓN  (gid 576890334) → asignaciones por camión
//   - Hoja NO SALEN                   → personal que no sale + motivo
// El sync es idempotente: borra lo que haya en DB para cada fecha del rango y
// reinserta desde la planilla. Camiones de la flota ausentes en FORMACIÓN ese
// día reciben estado `sin_carga`.
// ============================================================================

const SHEET_ID = "1dJZG46JXlEMZGI8PSogBrIcB2P8oR0dYuxknQPYy7jU"
const GVIZ_BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`

// Mini-parser CSV — gviz devuelve filas con campos quoted ("..."). Maneja
// quotes escapadas como `""` y comas internas. No depende de papaparse.
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else { field += c }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { row.push(field); field = "" }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
      else if (c === "\r") { /* ignore */ }
      else field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, i) => { obj[h] = (r[i] ?? "").trim() })
    return obj
  })
}

// "27/02/2026" o "2/01/2026" → "2026-02-27" / "2026-01-02"
// Retorna null si no parsea o si el año es inválido (ej "0206").
function parseFechaDDMMYYYY(s: string): string | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const dd = m[1].padStart(2, "0")
  const mm = m[2].padStart(2, "0")
  const yyyy = m[3]
  const yearN = Number(yyyy)
  if (yearN < 2020 || yearN > 2100) return null
  return `${yyyy}-${mm}-${dd}`
}

// Normaliza nombre / patente para matching tolerante.
// Mayúsculas, sin acentos, sin comas, espacios colapsados.
function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/,/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

const MAPEO_MOTIVOS_SHEET: Record<string, MotivoNoSale> = {
  "VACACIONES": "vacaciones",
  "DEPOSITO": "deposito",
  "DEPÓSITO": "deposito",
  "LICENCIA": "licencia",
  "SUSPENDIDO": "suspendido",
  "AUSENTE": "ausente",
  "FRANCO": "franco",
}

function mapearMotivo(raw: string): MotivoNoSale {
  const k = normalizar(raw)
  return MAPEO_MOTIVOS_SHEET[k] ?? "otro"
}

// Convierte string a número o null. Acepta "1.234" o "1,234" como decimales.
function toNum(s: string): number | null {
  if (!s) return null
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export interface SyncOrdenSalidaResult {
  fechasProcesadas: number
  asignacionesInsertadas: number
  noSaleInsertadas: number
  camionesSinCarga: number
  advertencias: string[]
  rangoDesde: string
  rangoHasta: string
}

export async function sincronizarOrdenSalidaDesdeSheets(
  ultimosDias: number
): Promise<Result<SyncOrdenSalidaResult>> {
  try {
    await requireRole([...ROLES_EDITOR])

    if (!IS_MISIONES) {
      return { error: "La sincronización con la planilla solo está disponible en Misiones." }
    }

    const dias = Math.max(1, Math.min(365, Math.floor(ultimosDias || 7)))

    const hoy = new Date()
    const desde = new Date(hoy); desde.setUTCDate(desde.getUTCDate() - (dias - 1))
    const rangoDesde = desde.toISOString().slice(0, 10)
    const rangoHasta = hoy.toISOString().slice(0, 10)

    // Fetch concurrente de las dos hojas
    const [resForm, resNoSale] = await Promise.all([
      fetch(`${GVIZ_BASE}&gid=576890334`, { cache: "no-store" }),
      fetch(`${GVIZ_BASE}&sheet=${encodeURIComponent("NO SALEN")}`, { cache: "no-store" }),
    ])
    if (!resForm.ok) return { error: `No se pudo leer la hoja FORMACIÓN (HTTP ${resForm.status})` }
    if (!resNoSale.ok) return { error: `No se pudo leer la hoja NO SALEN (HTTP ${resNoSale.status})` }

    const filasFormacion = rowsToObjects(parseCSV(await resForm.text()))
    const filasNoSale = rowsToObjects(parseCSV(await resNoSale.text()))

    // Catálogos para mapear nombres → empleado_id, patentes → vehiculo_id
    const supabase = await createClient()
    const [empRes, flotaRes] = await Promise.all([
      supabase
        .from("empleados")
        .select("id, nombre")
        .eq("activo", true),
      supabase
        .from("orden_salida_flota")
        .select(
          `vehiculo_id, sucursal,
           vehiculo:catalogo_vehiculos!orden_salida_flota_vehiculo_id_fkey(dominio)`
        )
        .eq("activo", true),
    ])
    if (empRes.error) return { error: empRes.error.message }
    if (flotaRes.error) return { error: flotaRes.error.message }

    const empleadoPorNombre = new Map<string, string>()
    for (const e of empRes.data ?? []) {
      empleadoPorNombre.set(normalizar(e.nombre as string), e.id as string)
    }

    const camionPorPatente = new Map<string, string>()
    const todasLasPatentes: string[] = []
    for (const f of (flotaRes.data ?? []) as unknown as Array<{
      vehiculo_id: string
      vehiculo: { dominio: string } | null
    }>) {
      const dom = f.vehiculo?.dominio
      if (!dom) continue
      camionPorPatente.set(normalizar(dom), f.vehiculo_id)
      todasLasPatentes.push(dom)
    }

    const advertencias: string[] = []
    const advertir = (msg: string) => {
      if (advertencias.length < 50 && !advertencias.includes(msg)) advertencias.push(msg)
    }

    // ─── Buildear rows nuevas para asignaciones ────────────────────────────────
    type AsigRow = {
      fecha: string
      camion_id: string
      chofer_empleado_id: string | null
      ayudante_empleado_id: string | null
      zona: string
      estado: EstadoCamionDiario
      observacion: string
      clientes: number | null
      sobrecarga_completa: number | null
      media_sobrecarga: number | null
      cuarto_sobrecarga: number | null
      bultos: number | null
    }
    const asigPorFecha = new Map<string, Map<string, AsigRow>>() // fecha → camion_id → row

    for (const fila of filasFormacion) {
      const fechaIso = parseFechaDDMMYYYY(fila["FECHA"])
      if (!fechaIso) continue
      if (fechaIso < rangoDesde || fechaIso > rangoHasta) continue

      const patenteRaw = fila["CAMIÓN"] || fila["CAMION"] || ""
      const camionId = camionPorPatente.get(normalizar(patenteRaw))
      if (!camionId) {
        if (patenteRaw.trim()) advertir(`Patente desconocida en FORMACIÓN: ${patenteRaw}`)
        continue
      }

      const choferRaw = fila["CHOFER"] || ""
      const ayudanteRaw = fila["AYUDANTE"] || ""
      const choferId = choferRaw ? empleadoPorNombre.get(normalizar(choferRaw)) ?? null : null
      const ayudanteId = ayudanteRaw ? empleadoPorNombre.get(normalizar(ayudanteRaw)) ?? null : null
      if (choferRaw && !choferId) advertir(`Empleado desconocido (chofer): ${choferRaw}`)
      if (ayudanteRaw && !ayudanteId) advertir(`Empleado desconocido (ayudante): ${ayudanteRaw}`)

      const row: AsigRow = {
        fecha: fechaIso,
        camion_id: camionId,
        chofer_empleado_id: choferId,
        ayudante_empleado_id: ayudanteId,
        zona: (fila["ZONA"] || "").trim(),
        estado: "operativo",
        observacion: "",
        clientes: toNum(fila["CLIENTES"] || ""),
        sobrecarga_completa: toNum(fila["1 SOBRE"] || fila["SOBREC."] || ""),
        media_sobrecarga: toNum(fila["1/2 SOBREC"] || fila["1/2 SC"] || ""),
        cuarto_sobrecarga: toNum(fila["1/4 SOBRECARGA"] || fila["1/4 SC"] || ""),
        bultos: toNum(fila["Bultos"] || fila["BULTOS"] || ""),
      }
      let porCamion = asigPorFecha.get(fechaIso)
      if (!porCamion) { porCamion = new Map(); asigPorFecha.set(fechaIso, porCamion) }
      // Si la planilla repite (fecha, camión), se queda con la última.
      porCamion.set(camionId, row)
    }

    // ─── Camiones sin carga: completar la flota para cada fecha procesada ─────
    let camionesSinCargaCount = 0
    const todosLosCamionIds = Array.from(camionPorPatente.values())
    for (const [fecha, porCamion] of asigPorFecha.entries()) {
      for (const camionId of todosLosCamionIds) {
        if (porCamion.has(camionId)) continue
        porCamion.set(camionId, {
          fecha,
          camion_id: camionId,
          chofer_empleado_id: null,
          ayudante_empleado_id: null,
          zona: "",
          estado: "sin_carga",
          observacion: "",
          clientes: null,
          sobrecarga_completa: null,
          media_sobrecarga: null,
          cuarto_sobrecarga: null,
          bultos: null,
        })
        camionesSinCargaCount++
      }
    }

    // ─── Buildear rows nuevas para "no salen" ──────────────────────────────────
    type NoSaleRow = {
      fecha: string
      empleado_id: string
      motivo: MotivoNoSale
      detalle: string
    }
    const noSalePorFecha = new Map<string, Map<string, NoSaleRow>>()
    for (const fila of filasNoSale) {
      const fechaIso = parseFechaDDMMYYYY(fila["FECHA"])
      if (!fechaIso) continue
      if (fechaIso < rangoDesde || fechaIso > rangoHasta) continue
      const nombreRaw = fila["NOMBRE"] || ""
      const empId = empleadoPorNombre.get(normalizar(nombreRaw))
      if (!empId) {
        if (nombreRaw.trim()) advertir(`Empleado desconocido (no-sale): ${nombreRaw}`)
        continue
      }
      const row: NoSaleRow = {
        fecha: fechaIso,
        empleado_id: empId,
        motivo: mapearMotivo(fila["MOTIVO"] || ""),
        detalle: "",
      }
      let porEmp = noSalePorFecha.get(fechaIso)
      if (!porEmp) { porEmp = new Map(); noSalePorFecha.set(fechaIso, porEmp) }
      porEmp.set(empId, row)
    }

    // ─── Wipe + insert por fecha ──────────────────────────────────────────────
    const fechasProcesadas = new Set<string>([
      ...asigPorFecha.keys(),
      ...noSalePorFecha.keys(),
    ])

    let asigInsertadas = 0
    let noSaleInsertadas = 0

    for (const fecha of fechasProcesadas) {
      const { error: errDelAsig } = await supabase
        .from("orden_salida_camion_diario")
        .delete()
        .eq("fecha", fecha)
      if (errDelAsig) return { error: `Borrando asignaciones (${fecha}): ${errDelAsig.message}` }

      const { error: errDelNo } = await supabase
        .from("orden_salida_personal_no_sale")
        .delete()
        .eq("fecha", fecha)
      if (errDelNo) return { error: `Borrando no-sale (${fecha}): ${errDelNo.message}` }

      const asigRows = Array.from(asigPorFecha.get(fecha)?.values() ?? [])
      if (asigRows.length > 0) {
        const { error: errIns } = await supabase
          .from("orden_salida_camion_diario")
          .insert(asigRows)
        if (errIns) return { error: `Insertando asignaciones (${fecha}): ${errIns.message}` }
        asigInsertadas += asigRows.length
      }

      const noSaleRows = Array.from(noSalePorFecha.get(fecha)?.values() ?? [])
      if (noSaleRows.length > 0) {
        const { error: errIns } = await supabase
          .from("orden_salida_personal_no_sale")
          .insert(noSaleRows)
        if (errIns) return { error: `Insertando no-sale (${fecha}): ${errIns.message}` }
        noSaleInsertadas += noSaleRows.length
      }
    }

    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")

    return {
      data: {
        fechasProcesadas: fechasProcesadas.size,
        asignacionesInsertadas: asigInsertadas,
        noSaleInsertadas: noSaleInsertadas,
        camionesSinCarga: camionesSinCargaCount,
        advertencias,
        rangoDesde,
        rangoHasta,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// Núcleo del sync de Orden de Salida desde la planilla.
// Sin verificación de rol y sin createClient propio: recibe el supabase client
// como parámetro para que la misma lógica sirva tanto al server action (auth
// por sesión) como al cron diario (auth por bearer + admin client).

import type { SupabaseClient } from "@supabase/supabase-js"
import type { EstadoCamionDiario, MotivoNoSale } from "@/types/database"

const SHEET_ID = "1dJZG46JXlEMZGI8PSogBrIcB2P8oR0dYuxknQPYy7jU"
const GVIZ_BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`

export interface SyncOrdenSalidaResult {
  fechasProcesadas: number
  asignacionesInsertadas: number
  noSaleInsertadas: number
  camionesSinCarga: number
  advertencias: string[]
  rangoDesde: string
  rangoHasta: string
}

type Result<T> = { data: T } | { error: string }

// ── Helpers de parsing ──────────────────────────────────────────────────────

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

function toNum(s: string): number | null {
  if (!s) return null
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

// ── Core del sync ───────────────────────────────────────────────────────────

export async function runOrdenSalidaSync(
  ultimosDias: number,
  supabase: SupabaseClient
): Promise<Result<SyncOrdenSalidaResult>> {
  const dias = Math.max(1, Math.min(365, Math.floor(ultimosDias || 7)))

  // Días futuros que el sync alcanza a leer. La planilla rara vez tiene más de
  // un día cargado, pero los sábados se carga la ruta del lunes, así que el
  // tope NO puede ser "mañana": debe abarcar cualquier fecha futura ya armada.
  const DIAS_ADELANTE = 14

  const hoy = new Date()
  const desde = new Date(hoy); desde.setUTCDate(desde.getUTCDate() - (dias - 1))
  const hasta = new Date(hoy); hasta.setUTCDate(hasta.getUTCDate() + DIAS_ADELANTE)
  const rangoDesde = desde.toISOString().slice(0, 10)
  const rangoHasta = hasta.toISOString().slice(0, 10)

  const [resForm, resNoSale] = await Promise.all([
    fetch(`${GVIZ_BASE}&gid=576890334`, { cache: "no-store" }),
    fetch(`${GVIZ_BASE}&sheet=${encodeURIComponent("NO SALEN")}`, { cache: "no-store" }),
  ])
  if (!resForm.ok) return { error: `No se pudo leer la hoja FORMACIÓN (HTTP ${resForm.status})` }
  if (!resNoSale.ok) return { error: `No se pudo leer la hoja NO SALEN (HTTP ${resNoSale.status})` }

  const filasFormacion = rowsToObjects(parseCSV(await resForm.text()))
  const filasNoSale = rowsToObjects(parseCSV(await resNoSale.text()))

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
  for (const f of (flotaRes.data ?? []) as unknown as Array<{
    vehiculo_id: string
    vehiculo: { dominio: string } | null
  }>) {
    const dom = f.vehiculo?.dominio
    if (!dom) continue
    camionPorPatente.set(normalizar(dom), f.vehiculo_id)
  }

  const advertencias: string[] = []
  const advertir = (msg: string) => {
    if (advertencias.length < 50 && !advertencias.includes(msg)) advertencias.push(msg)
  }

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
  const asigPorFecha = new Map<string, Map<string, AsigRow>>()

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
    porCamion.set(camionId, row)
  }

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
}

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { loadEstadoPlan } from "@/lib/vehiculos/plan-mantenimiento"
import {
  loadServiceGeneral,
  estadoPorDias,
  type DocumentoVencimiento,
  type ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import {
  startOfYear,
  today,
  daysBetween,
  type LecturaSugerida,
} from "@/lib/vehiculos/lecturas"
import type {
  CostosMantenimiento,
  DiaRuteo,
  EstadoPlanVehiculo,
  FlotaIndisponibilidad,
  MantenimientoCategoria,
  MantenimientoEstado,
  MantenimientoPlanOverride,
  MantenimientoPlanTarea,
  MantenimientoRealizado,
  MantenimientoTipo,
  VehiculoTipo,
} from "@/types/database"

// ==================== ESTADO DEL PLAN ====================

export async function getEstadoPlanFlota(): Promise<
  | {
      data: {
        estados: EstadoPlanVehiculo[]
        tareas: MantenimientoPlanTarea[]
        overrides: MantenimientoPlanOverride[]
        ultimasLecturas: Record<string, LecturaSugerida[]>
        historialLecturas: Record<string, LecturaSugerida[]>
      }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const { estados, tareas, overrides, ultimasLecturas, historialLecturas } =
      await loadEstadoPlan()
    return { data: { estados, tareas, overrides, ultimasLecturas, historialLecturas } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== TABLERO OPERATIVO ====================

export interface TableroAlertaTri {
  vencidas: number
  hoy: number
  proximas: number
}

export interface TableroResumen {
  pendientes: {
    otAbiertas: number
    trabajosPendientes: number
    novedadesSinResolver: number
    ocSinCompra: number
  }
  hoy: {
    vehiculosChecklist: number
    novedadesCreadas: number
    otCreadas: number
    otCerradasTecnica: number
    otCerradasCompleta: number
    llantasInspeccionadas: number
  }
  alertas: {
    mantenimiento: TableroAlertaTri
    docsVehiculos: TableroAlertaTri
    docsPersonal: TableroAlertaTri
    docsProveedores: TableroAlertaTri
    proximoChecklist: TableroAlertaTri
    llantas: { profundidadBaja: number; presionBaja: number; presionAlta: number }
    inventario: { minimaSuperada: number; maximaSuperada: number }
  }
}

// Unidades dadas de baja (vendidas/retiradas): siguen en el catálogo con
// active=false para conservar su historial de OTs/checklists.
export interface UnidadBaja {
  dominio: string
  descripcion: string | null
  tipo: string | null
}

// Umbrales de llantas (orientativos, ajustables luego por config).
const LLANTA_PROF_MIN_MM = 3
const LLANTA_PRESION_MIN_PSI = 90
const LLANTA_PRESION_MAX_PSI = 120

function triVacio(): TableroAlertaTri {
  return { vencidas: 0, hoy: 0, proximas: 0 }
}

function clasificarDias(tri: TableroAlertaTri, dias: number) {
  if (dias < 0) tri.vencidas++
  else if (dias === 0) tri.hoy++
  else if (dias <= 30) tri.proximas++
}

export async function getTableroOperativo(): Promise<
  | {
      data: {
        programacion: ServiceGeneralUnidad[]
        documentos: DocumentoVencimiento[]
        resumen: TableroResumen
        unidadesBaja: UnidadBaja[]
      }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = today()

    const programacion = await loadServiceGeneral()

    const [
      catsRes,
      reqsRes,
      otRes,
      chkRes,
      vehRes,
      bajasRes,
      novRes,
      llantasRes,
      repuestosRes,
      ocRes,
    ] = await Promise.all([
      supabase
        .from("requisitos_legales_categorias")
        .select("id, nombre, tipo_identificador"),
      supabase
        .from("requisitos_legales")
        .select("id, nombre, fecha_vencimiento, categoria_id")
        .not("fecha_vencimiento", "is", null)
        .order("fecha_vencimiento"),
      supabase
        .from("mantenimiento_realizados")
        .select("estado, costo, created_at, updated_at"),
      supabase.from("checklist_vehiculos").select("dominio, fecha, tipo"),
      supabase.from("catalogo_vehiculos").select("dominio, tipo").eq("active", true),
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, descripcion, tipo")
        .eq("active", false)
        .order("dominio"),
      supabase.from("mantenimiento_novedades").select("estado, fecha"),
      supabase
        .from("mantenimiento_llantas")
        .select("dominio, posicion, fecha, profundidad_mm, presion_psi"),
      supabase.from("mantenimiento_repuestos").select("stock_actual, stock_min, stock_max"),
      supabase.from("mantenimiento_ordenes_compra").select("estado"),
    ])
    for (const r of [
      catsRes, reqsRes, otRes, chkRes, vehRes, bajasRes, novRes, llantasRes, repuestosRes, ocRes,
    ]) {
      if (r.error) throw new Error(r.error.message)
    }

    // --- Categorías de documentos por tipo de identificador ---
    const catTipo = new Map<string, string>()
    const catNombre = new Map<string, string>()
    for (const c of (catsRes.data || []) as Array<{
      id: string
      nombre: string
      tipo_identificador: string
    }>) {
      catTipo.set(c.id, c.tipo_identificador)
      catNombre.set(c.id, c.nombre)
    }

    // --- Documentos: detalle de vehículos + buckets por tipo ---
    const documentos: DocumentoVencimiento[] = []
    const docsVehiculos = triVacio()
    const docsPersonal = triVacio()
    const docsProveedores = triVacio()
    for (const r of (reqsRes.data || []) as Array<{
      id: string
      nombre: string
      fecha_vencimiento: string
      categoria_id: string
    }>) {
      const venc = r.fecha_vencimiento.slice(0, 10)
      const dias = venc >= hoy ? daysBetween(hoy, venc) : -daysBetween(venc, hoy)
      const tipo = catTipo.get(r.categoria_id)
      if (tipo === "vehiculo") {
        clasificarDias(docsVehiculos, dias)
        documentos.push({
          id: r.id,
          dominio: r.nombre,
          categoria: catNombre.get(r.categoria_id) ?? "",
          fechaVencimiento: venc,
          diasRestantes: dias,
          estado: estadoPorDias(dias),
        })
      } else if (tipo === "persona") {
        clasificarDias(docsPersonal, dias)
      } else if (tipo === "proveedor") {
        clasificarDias(docsProveedores, dias)
      }
    }

    // --- Programaciones de mantenimiento (service general) ---
    const mantenimiento = triVacio()
    for (const p of programacion) {
      if (p.diasRestantes != null) clasificarDias(mantenimiento, p.diasRestantes)
    }

    // --- Órdenes de trabajo ---
    let otAbiertas = 0
    let trabajosPendientes = 0
    let otCreadas = 0
    let otCerradasTecnica = 0
    let otCerradasCompleta = 0
    for (const o of (otRes.data || []) as Array<{
      estado: string
      costo: number | null
      created_at: string
      updated_at: string
    }>) {
      if (o.estado === "programado") otAbiertas++
      else if (o.estado === "en_taller") trabajosPendientes++
      if (o.created_at?.slice(0, 10) === hoy) otCreadas++
      if (o.estado === "completado" && o.updated_at?.slice(0, 10) === hoy) {
        if (o.costo == null) otCerradasTecnica++
        else otCerradasCompleta++
      }
    }

    // --- Checklists: hechos hoy + programación (diaria) ---
    const ultimoChkPorDom = new Map<string, string>()
    const checklistHoy = new Set<string>()
    for (const c of (chkRes.data || []) as Array<{
      dominio: string
      fecha: string
      tipo: string
    }>) {
      const f = c.fecha.slice(0, 10)
      if (f === hoy) checklistHoy.add(c.dominio)
      const prev = ultimoChkPorDom.get(c.dominio)
      if (!prev || f > prev) ultimoChkPorDom.set(c.dominio, f)
    }
    const proximoChecklist = triVacio()
    for (const v of (vehRes.data || []) as Array<{ dominio: string; tipo: string | null }>) {
      // Solo unidades que hacen checklist de ruta (no autoelevadores).
      if (v.tipo === "autoelevador") continue
      const ult = ultimoChkPorDom.get(v.dominio)
      const dias = ult ? daysBetween(ult, hoy) : 999
      if (dias >= 2) proximoChecklist.vencidas++
      else if (dias === 1) proximoChecklist.hoy++
      else proximoChecklist.proximas++ // hecho hoy → al día
    }

    // --- Novedades ---
    let novedadesSinResolver = 0
    let novedadesCreadas = 0
    for (const n of (novRes.data || []) as Array<{ estado: string; fecha: string }>) {
      if (n.estado !== "resuelta") novedadesSinResolver++
      if (n.fecha?.slice(0, 10) === hoy) novedadesCreadas++
    }

    // --- Llantas: última inspección por dominio+posición ---
    const llaveLlanta = (d: string, p: string | null) => `${d}|${p ?? ""}`
    const ultLlanta = new Map<string, { fecha: string; prof: number | null; presion: number | null }>()
    let llantasInspeccionadas = 0
    for (const l of (llantasRes.data || []) as Array<{
      dominio: string
      posicion: string | null
      fecha: string
      profundidad_mm: number | null
      presion_psi: number | null
    }>) {
      if (l.fecha?.slice(0, 10) === hoy) llantasInspeccionadas++
      const k = llaveLlanta(l.dominio, l.posicion)
      const prev = ultLlanta.get(k)
      if (!prev || l.fecha > prev.fecha) {
        ultLlanta.set(k, {
          fecha: l.fecha,
          prof: l.profundidad_mm != null ? Number(l.profundidad_mm) : null,
          presion: l.presion_psi != null ? Number(l.presion_psi) : null,
        })
      }
    }
    let profundidadBaja = 0
    let presionBaja = 0
    let presionAlta = 0
    for (const v of ultLlanta.values()) {
      if (v.prof != null && v.prof < LLANTA_PROF_MIN_MM) profundidadBaja++
      if (v.presion != null && v.presion < LLANTA_PRESION_MIN_PSI) presionBaja++
      if (v.presion != null && v.presion > LLANTA_PRESION_MAX_PSI) presionAlta++
    }

    // --- Inventario de repuestos ---
    let minimaSuperada = 0
    let maximaSuperada = 0
    for (const r of (repuestosRes.data || []) as Array<{
      stock_actual: number | null
      stock_min: number | null
      stock_max: number | null
    }>) {
      const act = Number(r.stock_actual ?? 0)
      if (r.stock_min != null && act <= Number(r.stock_min)) minimaSuperada++
      if (r.stock_max != null && act >= Number(r.stock_max)) maximaSuperada++
    }

    // --- Órdenes de compra ---
    let ocSinCompra = 0
    for (const o of (ocRes.data || []) as Array<{ estado: string }>) {
      if (o.estado === "pendiente") ocSinCompra++
    }

    const resumen: TableroResumen = {
      pendientes: { otAbiertas, trabajosPendientes, novedadesSinResolver, ocSinCompra },
      hoy: {
        vehiculosChecklist: checklistHoy.size,
        novedadesCreadas,
        otCreadas,
        otCerradasTecnica,
        otCerradasCompleta,
        llantasInspeccionadas,
      },
      alertas: {
        mantenimiento,
        docsVehiculos,
        docsPersonal,
        docsProveedores,
        proximoChecklist,
        llantas: { profundidadBaja, presionBaja, presionAlta },
        inventario: { minimaSuperada, maximaSuperada },
      },
    }

    const unidadesBaja = (bajasRes.data || []) as UnidadBaja[]

    return { data: { programacion, documentos, resumen, unidadesBaja } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== PLANTILLAS ====================

interface PlanTareaInput {
  codigo: string
  nombre: string
  categoria: MantenimientoCategoria
  tipo_vehiculo: VehiculoTipo
  frecuencia_km?: number | null
  frecuencia_meses?: number | null
  frecuencia_horas?: number | null
  orden?: number
}

export async function createPlanTarea(
  input: PlanTareaInput
): Promise<{ data: MantenimientoPlanTarea } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.frecuencia_km && !input.frecuencia_meses && !input.frecuencia_horas) {
      return { error: "Definí al menos una frecuencia (km, meses u horas)" }
    }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_plan_tareas")
      .insert({
        codigo: input.codigo.trim().toLowerCase().replace(/\s+/g, "_"),
        nombre: input.nombre.trim(),
        categoria: input.categoria,
        tipo_vehiculo: input.tipo_vehiculo,
        frecuencia_km: input.frecuencia_km || null,
        frecuencia_meses: input.frecuencia_meses || null,
        frecuencia_horas: input.frecuencia_horas || null,
        orden: input.orden ?? 0,
        created_by: profile.id,
      })
      .select()
      .single()
    if (error) return { error: error.message }
    return { data: data as MantenimientoPlanTarea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updatePlanTarea(
  id: string,
  input: Partial<PlanTareaInput> & { activo?: boolean }
): Promise<{ data: MantenimientoPlanTarea } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.nombre !== undefined) patch.nombre = input.nombre.trim()
    if (input.categoria !== undefined) patch.categoria = input.categoria
    if (input.frecuencia_km !== undefined) patch.frecuencia_km = input.frecuencia_km || null
    if (input.frecuencia_meses !== undefined) patch.frecuencia_meses = input.frecuencia_meses || null
    if (input.frecuencia_horas !== undefined) patch.frecuencia_horas = input.frecuencia_horas || null
    if (input.orden !== undefined) patch.orden = input.orden
    if (input.activo !== undefined) patch.activo = input.activo

    const { data, error } = await supabase
      .from("mantenimiento_plan_tareas")
      .update(patch)
      .eq("id", id)
      .select()
      .single()
    if (error) return { error: error.message }
    return { data: data as MantenimientoPlanTarea }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function upsertPlanOverride(input: {
  dominio: string
  tareaId: string
  frecuencia_km?: number | null
  frecuencia_meses?: number | null
  frecuencia_horas?: number | null
  activo?: boolean
}): Promise<{ data: MantenimientoPlanOverride } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_plan_overrides")
      .upsert(
        {
          dominio: input.dominio.trim().toUpperCase(),
          tarea_id: input.tareaId,
          frecuencia_km: input.frecuencia_km ?? null,
          frecuencia_meses: input.frecuencia_meses ?? null,
          frecuencia_horas: input.frecuencia_horas ?? null,
          activo: input.activo ?? true,
          created_by: profile.id,
        },
        { onConflict: "dominio,tarea_id" }
      )
      .select()
      .single()
    if (error) return { error: error.message }
    return { data: data as MantenimientoPlanOverride }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deletePlanOverride(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_plan_overrides").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== MANTENIMIENTOS ====================

interface MantenimientoFilter {
  dominio?: string
  tipo?: MantenimientoTipo
  estado?: MantenimientoEstado
  fechaDesde?: string
  fechaHasta?: string
  limit?: number
}

export async function getMantenimientos(
  filters?: MantenimientoFilter
): Promise<{ data: MantenimientoRealizado[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("mantenimiento_realizados")
      .select(
        "*, tareas:mantenimiento_realizado_tareas(*), repuestos:mantenimiento_realizado_repuestos(*)"
      )
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })

    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.estado) query = query.eq("estado", filters.estado)
    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as MantenimientoRealizado[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Sugiere el siguiente N° de OT = (máximo N° de OT numérico cargado) + 1, para
 * prellenar el campo al crear una orden. Es solo una sugerencia editable: los
 * N° de OT históricos son enteros correlativos (migrados de Cloudfleet). Cadena
 * vacía si todavía no hay ninguna OT numérica. Recorre TODAS las filas (no el
 * límite de la grilla) para no sugerir un número ya usado.
 */
// Siguiente correlativo de OT = mayor numero_ot puramente numérico + 1 (las OT
// importadas de Cloudfleet también cuentan: la serie manual continúa la de
// Cloudfleet, que quedó discontinuado). Arranca en 1 si no hay ninguna.
async function calcularSiguienteNumeroOt(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  const { data, error } = await supabase
    .from("mantenimiento_realizados")
    .select("numero_ot")
    .not("numero_ot", "is", null)
  if (error) throw new Error(error.message)
  let max = 0
  for (const r of (data || []) as Array<{ numero_ot: string | null }>) {
    const n = (r.numero_ot ?? "").trim()
    if (/^\d+$/.test(n)) max = Math.max(max, parseInt(n, 10))
  }
  return String(max + 1)
}

export async function getSiguienteNumeroOt(): Promise<
  { data: string } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    return { data: await calcularSiguienteNumeroOt(supabase) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SYNC OT → NEUMÁTICOS ====================

// Una OT completada cuyas tareas (u observaciones) mencionan rotación o
// alineación/balanceo registra automáticamente esa rotación/alineación en el
// módulo Neumáticos, vinculada por ot_id (carga única: la OT). Si la OT deja
// de estar completada o pierde la tarea, el registro vinculado se elimina.
function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

async function sincronizarNeumaticosDesdeOt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  otId: string
): Promise<void> {
  const { data: ot } = await supabase
    .from("mantenimiento_realizados")
    .select(
      "id, dominio, fecha, estado, odometro, taller, costo, numero_ot, observaciones, tareas:mantenimiento_realizado_tareas(descripcion)"
    )
    .eq("id", otId)
    .single()
  if (!ot) return

  const textos = [
    ...((ot.tareas as Array<{ descripcion: string | null }> | null) ?? []).map(
      (t) => t.descripcion ?? ""
    ),
    ot.observaciones ?? "",
  ].map(normalizarTexto)
  const tieneRotacion = textos.some((t) => t.includes("rotacion"))
  const tieneAlineacion = textos.some(
    (t) => t.includes("alineacion") || t.includes("balanceo")
  )
  const completada = ot.estado === "completado"

  const sync = async (
    tabla: "mantenimiento_rotaciones" | "mantenimiento_alineaciones",
    aplica: boolean,
    valores: Record<string, unknown>
  ) => {
    if (aplica && completada) {
      const { data: previo } = await supabase
        .from(tabla)
        .select("id")
        .eq("ot_id", ot.id)
        .maybeSingle()
      if (previo) {
        await supabase.from(tabla).update(valores).eq("id", previo.id)
      } else {
        await supabase.from(tabla).insert({ ...valores, ot_id: ot.id })
      }
    } else {
      await supabase.from(tabla).delete().eq("ot_id", ot.id)
    }
  }

  const base = {
    dominio: ot.dominio,
    fecha: ot.fecha,
    km: ot.odometro ?? null,
    observaciones: `Desde OT${ot.numero_ot ? ` #${ot.numero_ot}` : ""}`,
  }
  await sync("mantenimiento_rotaciones", tieneRotacion, base)
  await sync("mantenimiento_alineaciones", tieneAlineacion, {
    ...base,
    costo: ot.costo ?? null,
    proveedor: ot.taller ?? null,
  })
}

interface MantenimientoTareaInput {
  tareaId?: string
  descripcion?: string
  costo?: number
}

interface MantenimientoRepuestoInput {
  descripcion: string
  cantidad?: number
  costoUnitario?: number | null
}

interface CreateMantenimientoInput {
  dominio: string
  fecha: string
  tipo: MantenimientoTipo
  estado?: MantenimientoEstado
  odometro?: number | null
  horometro?: number | null
  taller?: string
  costo?: number | null
  numero_factura?: string
  numero_ot?: string
  horas_mano_obra?: number | null
  costo_mano_obra?: number | null
  observaciones?: string
  es_service_general?: boolean
  evidencia_urls?: string[] | null
  fuera_servicio_desde?: string | null
  fuera_servicio_hasta?: string | null
  entrada_taller?: string | null
  salida_taller?: string | null
  tareas: MantenimientoTareaInput[]
  repuestos?: MantenimientoRepuestoInput[]
}

const FACTURAS_BUCKET = "mantenimiento-evidencias"

/**
 * Sube las facturas/comprobantes de un mantenimiento al Storage y devuelve las
 * URLs públicas (para guardar en mantenimiento_realizados.evidencia_urls).
 * Recibe FormData con el campo `facturas` (uno o más File) y `dominio`.
 */
export async function subirFacturasMantenimiento(
  formData: FormData
): Promise<{ data: string[] } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const files = formData
      .getAll("facturas")
      .filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) return { data: [] }
    const dominio = String(formData.get("dominio") || "SIN").trim().toUpperCase() || "SIN"
    const urls: string[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `${dominio}/${Date.now()}-${i}-${clean}`
      const ab = await file.arrayBuffer()
      const { error } = await supabase.storage
        .from(FACTURAS_BUCKET)
        .upload(path, ab, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (error) return { error: error.message }
      const { data: pub } = supabase.storage.from(FACTURAS_BUCKET).getPublicUrl(path)
      urls.push(pub.publicUrl)
    }
    return { data: urls }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// El período "fuera de servicio" (para la disponibilidad de flota) se deriva de
// la fecha de entrada/salida del taller, salvo que se pasen los campos
// fuera_servicio_* explícitos (compatibilidad con el toggle y otros llamadores).
function derivarFueraServicio(input: {
  entrada_taller?: string | null
  salida_taller?: string | null
  fuera_servicio_desde?: string | null
  fuera_servicio_hasta?: string | null
}): { desde: string | null; hasta: string | null } {
  const desde =
    input.fuera_servicio_desde !== undefined
      ? input.fuera_servicio_desde || null
      : input.entrada_taller
        ? input.entrada_taller.slice(0, 10)
        : null
  const hasta =
    input.fuera_servicio_hasta !== undefined
      ? input.fuera_servicio_hasta || null
      : input.salida_taller
        ? input.salida_taller.slice(0, 10)
        : null
  return { desde, hasta }
}

export async function createMantenimiento(
  input: CreateMantenimientoInput
): Promise<{ data: MantenimientoRealizado } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (input.tareas.length === 0) {
      return { error: "Agregá al menos una tarea realizada" }
    }
    const supabase = await createClient()
    const fs = derivarFueraServicio(input)

    // Toda OT nueva queda numerada: si no vino un N° de OT, se asigna el
    // siguiente correlativo al momento de guardar (evita sugerencias viejas).
    const numeroOt =
      input.numero_ot?.trim() || (await calcularSiguienteNumeroOt(supabase))

    const { data, error } = await supabase
      .from("mantenimiento_realizados")
      .insert({
        dominio: input.dominio.trim().toUpperCase(),
        fecha: input.fecha,
        tipo: input.tipo,
        estado: input.estado ?? "completado",
        odometro: input.odometro ?? null,
        horometro: input.horometro ?? null,
        taller: input.taller?.trim() || null,
        costo: input.costo ?? null,
        numero_factura: input.numero_factura?.trim() || null,
        numero_ot: numeroOt,
        horas_mano_obra: input.horas_mano_obra ?? null,
        costo_mano_obra: input.costo_mano_obra ?? null,
        observaciones: input.observaciones?.trim() || null,
        es_service_general: input.es_service_general ?? false,
        evidencia_urls: input.evidencia_urls ?? null,
        entrada_taller: input.entrada_taller || null,
        salida_taller: input.salida_taller || null,
        fuera_servicio_desde: fs.desde,
        fuera_servicio_hasta: fs.hasta,
        created_by: profile.id,
      })
      .select()
      .single()
    if (error) return { error: error.message }
    const mantenimiento = data as MantenimientoRealizado

    const { error: tareasError } = await supabase.from("mantenimiento_realizado_tareas").insert(
      input.tareas.map((t) => ({
        mantenimiento_id: mantenimiento.id,
        tarea_id: t.tareaId ?? null,
        descripcion: t.descripcion?.trim() || null,
        costo: t.costo ?? null,
      }))
    )
    if (tareasError) {
      // No dejar una cabecera huérfana si falló el detalle.
      await supabase.from("mantenimiento_realizados").delete().eq("id", mantenimiento.id)
      return { error: tareasError.message }
    }

    const repuestos = (input.repuestos ?? []).filter((r) => r.descripcion?.trim())
    if (repuestos.length > 0) {
      const { error: repError } = await supabase.from("mantenimiento_realizado_repuestos").insert(
        repuestos.map((r) => ({
          mantenimiento_id: mantenimiento.id,
          descripcion: r.descripcion.trim(),
          cantidad: r.cantidad && r.cantidad > 0 ? r.cantidad : 1,
          costo_unitario: r.costoUnitario ?? null,
        }))
      )
      if (repError) {
        await supabase.from("mantenimiento_realizados").delete().eq("id", mantenimiento.id)
        return { error: repError.message }
      }
    }

    try {
      await sincronizarNeumaticosDesdeOt(supabase, mantenimiento.id)
    } catch (e) {
      console.error("Sync Neumáticos desde OT:", e)
    }

    return { data: mantenimiento }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface UpdateMantenimientoInput {
  id: string
  fecha?: string
  tipo?: MantenimientoTipo
  estado?: MantenimientoEstado
  odometro?: number | null
  horometro?: number | null
  taller?: string
  costo?: number | null
  numero_factura?: string
  numero_ot?: string
  horas_mano_obra?: number | null
  costo_mano_obra?: number | null
  observaciones?: string
  es_service_general?: boolean
  evidencia_urls?: string[] | null
  fuera_servicio_desde?: string | null
  fuera_servicio_hasta?: string | null
  entrada_taller?: string | null
  salida_taller?: string | null
  /** Si se pasa, reemplaza el detalle completo de tareas. */
  tareas?: MantenimientoTareaInput[]
  /** Si se pasa, reemplaza el detalle completo de repuestos. */
  repuestos?: MantenimientoRepuestoInput[]
}

export async function updateMantenimiento(
  input: UpdateMantenimientoInput
): Promise<{ data: MantenimientoRealizado } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.fecha !== undefined) patch.fecha = input.fecha
    if (input.tipo !== undefined) patch.tipo = input.tipo
    if (input.estado !== undefined) patch.estado = input.estado
    if (input.odometro !== undefined) patch.odometro = input.odometro
    if (input.horometro !== undefined) patch.horometro = input.horometro
    if (input.taller !== undefined) patch.taller = input.taller?.trim() || null
    if (input.costo !== undefined) patch.costo = input.costo
    if (input.numero_factura !== undefined)
      patch.numero_factura = input.numero_factura?.trim() || null
    if (input.numero_ot !== undefined) patch.numero_ot = input.numero_ot?.trim() || null
    if (input.horas_mano_obra !== undefined) patch.horas_mano_obra = input.horas_mano_obra
    if (input.costo_mano_obra !== undefined) patch.costo_mano_obra = input.costo_mano_obra
    if (input.observaciones !== undefined)
      patch.observaciones = input.observaciones?.trim() || null
    if (input.es_service_general !== undefined)
      patch.es_service_general = input.es_service_general
    if (input.evidencia_urls !== undefined) patch.evidencia_urls = input.evidencia_urls
    if (input.entrada_taller !== undefined) patch.entrada_taller = input.entrada_taller || null
    if (input.salida_taller !== undefined) patch.salida_taller = input.salida_taller || null
    // Fuera de servicio: explícito si se pasa; si no, se deriva de entrada/salida.
    if (input.fuera_servicio_desde !== undefined)
      patch.fuera_servicio_desde = input.fuera_servicio_desde || null
    else if (input.entrada_taller !== undefined)
      patch.fuera_servicio_desde = input.entrada_taller ? input.entrada_taller.slice(0, 10) : null
    if (input.fuera_servicio_hasta !== undefined)
      patch.fuera_servicio_hasta = input.fuera_servicio_hasta || null
    else if (input.salida_taller !== undefined)
      patch.fuera_servicio_hasta = input.salida_taller ? input.salida_taller.slice(0, 10) : null

    const { data, error } = await supabase
      .from("mantenimiento_realizados")
      .update(patch)
      .eq("id", input.id)
      .select()
      .single()
    if (error) return { error: error.message }

    if (input.tareas) {
      if (input.tareas.length === 0) {
        return { error: "El mantenimiento debe conservar al menos una tarea" }
      }
      const { error: delError } = await supabase
        .from("mantenimiento_realizado_tareas")
        .delete()
        .eq("mantenimiento_id", input.id)
      if (delError) return { error: delError.message }
      const { error: insError } = await supabase.from("mantenimiento_realizado_tareas").insert(
        input.tareas.map((t) => ({
          mantenimiento_id: input.id,
          tarea_id: t.tareaId ?? null,
          descripcion: t.descripcion?.trim() || null,
          costo: t.costo ?? null,
        }))
      )
      if (insError) return { error: insError.message }
    }

    if (input.repuestos) {
      const { error: delRepError } = await supabase
        .from("mantenimiento_realizado_repuestos")
        .delete()
        .eq("mantenimiento_id", input.id)
      if (delRepError) return { error: delRepError.message }
      const repuestos = input.repuestos.filter((r) => r.descripcion?.trim())
      if (repuestos.length > 0) {
        const { error: insRepError } = await supabase
          .from("mantenimiento_realizado_repuestos")
          .insert(
            repuestos.map((r) => ({
              mantenimiento_id: input.id,
              descripcion: r.descripcion.trim(),
              cantidad: r.cantidad && r.cantidad > 0 ? r.cantidad : 1,
              costo_unitario: r.costoUnitario ?? null,
            }))
          )
        if (insRepError) return { error: insRepError.message }
      }
    }

    try {
      await sincronizarNeumaticosDesdeOt(supabase, input.id)
    } catch (e) {
      console.error("Sync Neumáticos desde OT:", e)
    }

    return { data: data as MantenimientoRealizado }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Marca si una orden de trabajo saca (o no) la unidad de circulación, para la
 * disponibilidad de flota. ON → setea `fuera_servicio_desde` (reusa el que ya
 * tenga o, si no, la fecha de la OT) y deja el "hasta" como esté (NULL = sigue
 * fuera de servicio mientras la OT esté abierta). OFF → limpia el período, así
 * la OT deja de descontar disponibilidad. Atajo para no entrar al diálogo de
 * edición; las fechas finas se siguen pudiendo ajustar ahí.
 */
export async function setOrdenFueraServicio(
  id: string,
  saca: boolean
): Promise<{ data: MantenimientoRealizado } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: actual, error: e0 } = await supabase
      .from("mantenimiento_realizados")
      .select("fecha, fuera_servicio_desde, fuera_servicio_hasta")
      .eq("id", id)
      .single()
    if (e0) return { error: e0.message }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (saca) {
      patch.fuera_servicio_desde =
        (actual.fuera_servicio_desde as string | null) || (actual.fecha as string)
      patch.fuera_servicio_hasta = (actual.fuera_servicio_hasta as string | null) ?? null
    } else {
      patch.fuera_servicio_desde = null
      patch.fuera_servicio_hasta = null
    }

    const { data, error } = await supabase
      .from("mantenimiento_realizados")
      .update(patch)
      .eq("id", id)
      .select()
      .single()
    if (error) return { error: error.message }
    return { data: data as MantenimientoRealizado }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteMantenimiento(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_realizados").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CHECK LISTS (vista mantenimiento) ====================

export type ChecklistPlanTipo = "correctivo" | "preventivo" | "proactivo"
export type ChecklistPlanEstado = "pendiente" | "en_proceso" | "resuelto"

export interface ChecklistPlanAccion {
  id: string
  respuestaId: string
  tipo: ChecklistPlanTipo
  estado: ChecklistPlanEstado
  descripcion: string
  fotoUrl: string | null
  fotoPath: string | null
  createdAt: string
  updatedAt: string
}

export interface ChecklistItemNoOk {
  id: string
  checklistId: string
  fecha: string
  dominio: string
  chofer: string | null
  tipo: string // liberacion | retorno
  categoria: string
  item: string
  valor: string // nook | regular | malo
  critico: boolean
  comentario: string | null
  plan: ChecklistPlanAccion | null
}

export interface ChecklistComentario {
  id: string
  fecha: string
  dominio: string
  chofer: string | null
  tipo: string
  resultado: string | null
  observaciones: string
}

// Observaciones triviales que no aportan al análisis de mantenimiento.
const OBS_TRIVIALES = new Set([
  "ok", "okey", "oka", "todo ok", "todo bien", "bien", "sin novedad",
  "sin novedades", "sin observaciones", "s/n", "n/a", "na", "-", ".",
])

export async function getChecklistsMtto(): Promise<
  | { data: { itemsNoOk: ChecklistItemNoOk[]; comentarios: ChecklistComentario[] } }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [respRes, cvRes] = await Promise.all([
      supabase
        .from("checklist_respuestas")
        .select(
          "id, checklist_id, valor, comentario, item:checklist_items(nombre, categoria, critico), cv:checklist_vehiculos(fecha, dominio, chofer, tipo)"
        )
        .not("valor", "in", '("ok","bueno")'),
      supabase
        .from("checklist_vehiculos")
        .select("id, fecha, dominio, chofer, tipo, resultado, observaciones")
        .not("observaciones", "is", null)
        .order("fecha", { ascending: false })
        .limit(300),
    ])
    if (respRes.error) throw new Error(respRes.error.message)
    if (cvRes.error) throw new Error(cvRes.error.message)

    type RespRow = {
      id: string
      checklist_id: string
      valor: string
      comentario: string | null
      item: { nombre: string; categoria: string; critico: boolean } | null
      cv: { fecha: string; dominio: string; chofer: string | null; tipo: string } | null
    }
    const itemsBase = ((respRes.data || []) as unknown as RespRow[])
      .filter((r) => r.cv && r.item)
      .map((r) => ({
        id: r.id,
        checklistId: r.checklist_id,
        fecha: r.cv!.fecha,
        dominio: r.cv!.dominio,
        chofer: r.cv!.chofer,
        tipo: r.cv!.tipo,
        categoria: r.item!.categoria,
        item: r.item!.nombre,
        valor: r.valor,
        critico: r.item!.critico,
        comentario: r.comentario?.trim() || null,
      }))

    // Planes de acción cargados para esos ítems observados.
    const respuestaIds = itemsBase.map((i) => i.id)
    const planesById = new Map<string, ChecklistPlanAccion>()
    if (respuestaIds.length > 0) {
      const { data: planesData, error: planesErr } = await supabase
        .from("checklist_planes_accion")
        .select(
          "id, respuesta_id, tipo, estado, descripcion, foto_url, foto_path, created_at, updated_at"
        )
        .in("respuesta_id", respuestaIds)
      if (planesErr) throw new Error(planesErr.message)
      type PlanRow = {
        id: string
        respuesta_id: string
        tipo: ChecklistPlanTipo
        estado: ChecklistPlanEstado
        descripcion: string
        foto_url: string | null
        foto_path: string | null
        created_at: string
        updated_at: string
      }
      for (const p of (planesData || []) as PlanRow[]) {
        planesById.set(p.respuesta_id, {
          id: p.id,
          respuestaId: p.respuesta_id,
          tipo: p.tipo,
          estado: p.estado,
          descripcion: p.descripcion,
          fotoUrl: p.foto_url,
          fotoPath: p.foto_path,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })
      }
    }

    const itemsNoOk: ChecklistItemNoOk[] = itemsBase
      .map((i) => ({ ...i, plan: planesById.get(i.id) ?? null }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))

    type CvRow = {
      id: string
      fecha: string
      dominio: string
      chofer: string | null
      tipo: string
      resultado: string | null
      observaciones: string | null
    }
    const comentarios: ChecklistComentario[] = ((cvRes.data || []) as CvRow[])
      .map((c) => ({ ...c, obs: (c.observaciones || "").trim() }))
      .filter((c) => c.obs !== "" && !OBS_TRIVIALES.has(c.obs.toLowerCase()))
      .map((c) => ({
        id: c.id,
        fecha: c.fecha,
        dominio: c.dominio,
        chofer: c.chofer,
        tipo: c.tipo,
        resultado: c.resultado,
        observaciones: c.obs,
      }))

    return { data: { itemsNoOk, comentarios } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

const PLANES_CHECK_BUCKET = "mantenimiento-evidencias"
const TIPOS_PLAN_CHECK = new Set(["correctivo", "preventivo", "proactivo"])
const ESTADOS_PLAN_CHECK = new Set(["pendiente", "en_proceso", "resuelto"])

/**
 * Crea o actualiza el plan de acción de un ítem observado del checklist
 * (1 plan por respuesta). Recibe FormData con: respuesta_id, tipo, estado,
 * descripcion, foto (File opcional) y eliminar_foto ("1" para borrar la actual).
 */
export async function upsertPlanChecklist(
  formData: FormData
): Promise<{ data: ChecklistPlanAccion } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const respuestaId = String(formData.get("respuesta_id") || "").trim()
    const tipo = String(formData.get("tipo") || "").trim()
    const estado = String(formData.get("estado") || "resuelto").trim()
    const descripcion = String(formData.get("descripcion") || "").trim()
    if (!respuestaId) return { error: "Falta el ítem del checklist" }
    if (!TIPOS_PLAN_CHECK.has(tipo)) return { error: "Tipo inválido (correctivo / preventivo / proactivo)" }
    if (!ESTADOS_PLAN_CHECK.has(estado)) return { error: "Estado inválido" }
    if (!descripcion) return { error: "Escribí qué se trabajó / reparó" }

    // Plan existente (para conservar foto / created_by si corresponde).
    const { data: existing } = await supabase
      .from("checklist_planes_accion")
      .select("id, foto_url, foto_path")
      .eq("respuesta_id", respuestaId)
      .maybeSingle()

    let fotoUrl: string | null = (existing?.foto_url as string | null) ?? null
    let fotoPath: string | null = (existing?.foto_path as string | null) ?? null

    const eliminarFoto = String(formData.get("eliminar_foto") || "") === "1"
    const file = formData.get("foto")
    const tieneFotoNueva = file instanceof File && file.size > 0

    if ((eliminarFoto || tieneFotoNueva) && fotoPath) {
      // Borrar la foto anterior del storage antes de reemplazarla/quitarla.
      await supabase.storage.from(PLANES_CHECK_BUCKET).remove([fotoPath])
      fotoUrl = null
      fotoPath = null
    }

    if (tieneFotoNueva) {
      const f = file as File
      const clean = f.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `planes-check/${respuestaId}/${Date.now()}-${clean}`
      const ab = await f.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from(PLANES_CHECK_BUCKET)
        .upload(path, ab, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        })
      if (upErr) return { error: `Subiendo foto: ${upErr.message}` }
      const { data: pub } = supabase.storage.from(PLANES_CHECK_BUCKET).getPublicUrl(path)
      fotoUrl = pub.publicUrl
      fotoPath = path
    }

    const payload = {
      respuesta_id: respuestaId,
      tipo,
      estado,
      descripcion,
      foto_url: fotoUrl,
      foto_path: fotoPath,
      updated_at: new Date().toISOString(),
    }

    let row
    if (existing) {
      const { data, error } = await supabase
        .from("checklist_planes_accion")
        .update(payload)
        .eq("id", existing.id)
        .select("id, respuesta_id, tipo, estado, descripcion, foto_url, foto_path, created_at, updated_at")
        .single()
      if (error) return { error: error.message }
      row = data
    } else {
      const { data, error } = await supabase
        .from("checklist_planes_accion")
        .insert({ ...payload, created_by: profile.id })
        .select("id, respuesta_id, tipo, estado, descripcion, foto_url, foto_path, created_at, updated_at")
        .single()
      if (error) return { error: error.message }
      row = data
    }

    return {
      data: {
        id: row.id,
        respuestaId: row.respuesta_id,
        tipo: row.tipo,
        estado: row.estado,
        descripcion: row.descripcion,
        fotoUrl: row.foto_url,
        fotoPath: row.foto_path,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Elimina el plan de acción de un ítem del checklist (y su foto). */
export async function eliminarPlanChecklist(
  respuestaId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { data: existing } = await supabase
      .from("checklist_planes_accion")
      .select("foto_path")
      .eq("respuesta_id", respuestaId)
      .maybeSingle()
    if (existing?.foto_path) {
      await supabase.storage.from(PLANES_CHECK_BUCKET).remove([existing.foto_path as string])
    }
    const { error } = await supabase
      .from("checklist_planes_accion")
      .delete()
      .eq("respuesta_id", respuestaId)
    if (error) return { error: error.message }
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Elimina por completo una observación No OK del listado: borra primero su plan
 * de acción (y la foto asociada) y luego la respuesta del checklist. Destructivo
 * sobre el dato del check → solo admin/supervisor.
 */
export async function eliminarItemChecklist(
  respuestaId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    // 1) plan de acción + foto (si tiene)
    const { data: plan } = await supabase
      .from("checklist_planes_accion")
      .select("foto_path")
      .eq("respuesta_id", respuestaId)
      .maybeSingle()
    if (plan?.foto_path) {
      await supabase.storage.from(PLANES_CHECK_BUCKET).remove([plan.foto_path as string])
    }
    const { error: planErr } = await supabase
      .from("checklist_planes_accion")
      .delete()
      .eq("respuesta_id", respuestaId)
    if (planErr) return { error: planErr.message }
    // 2) la respuesta observada del checklist
    const { error } = await supabase
      .from("checklist_respuestas")
      .delete()
      .eq("id", respuestaId)
    if (error) return { error: error.message }
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== GESTIÓN / CARGA (novedades, llantas, repuestos, OC) ====

export interface Novedad {
  id: string
  dominio: string
  fecha: string
  descripcion: string
  origen: string
  prioridad: string
  estado: string
  created_at: string
}
export interface LlantaInspeccion {
  id: string
  dominio: string
  fecha: string
  posicion: string | null
  profundidad_mm: number | null
  presion_psi: number | null
  observaciones: string | null
}
export interface Repuesto {
  id: string
  codigo: string | null
  nombre: string
  unidad: string | null
  stock_actual: number
  stock_min: number
  stock_max: number | null
  ubicacion: string | null
}
export interface OrdenCompra {
  id: string
  numero: string | null
  proveedor: string | null
  descripcion: string | null
  monto: number | null
  fecha: string
  estado: string
}

export async function getGestionMtto(): Promise<
  | {
      data: {
        novedades: Novedad[]
        llantas: LlantaInspeccion[]
        repuestos: Repuesto[]
        ordenesCompra: OrdenCompra[]
      }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [nov, lla, rep, oc] = await Promise.all([
      supabase.from("mantenimiento_novedades").select("*").order("fecha", { ascending: false }),
      supabase.from("mantenimiento_llantas").select("*").order("fecha", { ascending: false }),
      supabase.from("mantenimiento_repuestos").select("*").order("nombre"),
      supabase
        .from("mantenimiento_ordenes_compra")
        .select("*")
        .order("fecha", { ascending: false }),
    ])
    for (const r of [nov, lla, rep, oc]) if (r.error) throw new Error(r.error.message)
    return {
      data: {
        novedades: (nov.data || []) as Novedad[],
        llantas: (lla.data || []) as LlantaInspeccion[],
        repuestos: (rep.data || []) as Repuesto[],
        ordenesCompra: (oc.data || []) as OrdenCompra[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ----- Novedades -----
export async function createNovedad(input: {
  dominio: string
  fecha: string
  descripcion: string
  prioridad?: string
  origen?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.dominio || !input.descripcion.trim())
      return { error: "Completá unidad y descripción" }
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_novedades").insert({
      dominio: input.dominio.trim().toUpperCase(),
      fecha: input.fecha,
      descripcion: input.descripcion.trim(),
      prioridad: input.prioridad ?? "media",
      origen: input.origen ?? "manual",
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateNovedadEstado(
  id: string,
  estado: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_novedades")
      .update({
        estado,
        resuelta_at: estado === "resuelta" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ----- Llantas -----
export async function createLlanta(input: {
  dominio: string
  fecha: string
  posicion?: string
  profundidad_mm?: number | null
  presion_psi?: number | null
  observaciones?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.dominio) return { error: "Elegí la unidad" }
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_llantas").insert({
      dominio: input.dominio.trim().toUpperCase(),
      fecha: input.fecha,
      posicion: input.posicion?.trim() || null,
      profundidad_mm: input.profundidad_mm ?? null,
      presion_psi: input.presion_psi ?? null,
      observaciones: input.observaciones?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ----- Repuestos -----
export async function upsertRepuesto(input: {
  id?: string
  codigo?: string
  nombre: string
  unidad?: string
  stock_actual?: number | null
  stock_min?: number | null
  stock_max?: number | null
  ubicacion?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.nombre.trim()) return { error: "Ingresá el nombre del repuesto" }
    const supabase = await createClient()
    const row = {
      codigo: input.codigo?.trim() || null,
      nombre: input.nombre.trim(),
      unidad: input.unidad?.trim() || null,
      stock_actual: input.stock_actual ?? 0,
      stock_min: input.stock_min ?? 0,
      stock_max: input.stock_max ?? null,
      ubicacion: input.ubicacion?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = input.id
      ? await supabase.from("mantenimiento_repuestos").update(row).eq("id", input.id)
      : await supabase
          .from("mantenimiento_repuestos")
          .insert({ ...row, created_by: profile.id })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ----- Órdenes de compra -----
export async function createOrdenCompra(input: {
  numero?: string
  proveedor?: string
  descripcion?: string
  monto?: number | null
  fecha: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_ordenes_compra").insert({
      numero: input.numero?.trim() || null,
      proveedor: input.proveedor?.trim() || null,
      descripcion: input.descripcion?.trim() || null,
      monto: input.monto ?? null,
      fecha: input.fecha,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateOrdenCompraEstado(
  id: string,
  estado: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_ordenes_compra")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ----- Borrado genérico de filas de gestión -----
export async function deleteGestionRow(
  tabla: "novedades" | "llantas" | "repuestos" | "ordenes_compra",
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from(`mantenimiento_${tabla}`)
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== COSTOS ====================

export async function getCostosMantenimiento(): Promise<
  { data: CostosMantenimiento } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = today()
    const inicioAnio = startOfYear(hoy)
    const mesActual = hoy.slice(0, 7)

    const { data, error } = await supabase
      .from("mantenimiento_realizados")
      .select(
        "fecha, tipo, costo, costo_mano_obra, tareas:mantenimiento_realizado_tareas(costo), repuestos:mantenimiento_realizado_repuestos(cantidad, costo_unitario)"
      )
      .neq("estado", "cancelado")
      .gte("fecha", inicioAnio)
    if (error) return { error: error.message }

    let costoMes = 0
    let costoYTD = 0
    const porMesMap = new Map<
      string,
      { preventivo: number; correctivo: number; proactivo: number }
    >()
    for (const m of (data || []) as Array<{
      fecha: string
      tipo: MantenimientoTipo
      costo: number | null
      costo_mano_obra: number | null
      tareas: { costo: number | null }[]
      repuestos: { cantidad: number | null; costo_unitario: number | null }[]
    }>) {
      const costoTareas = (m.tareas || []).reduce((a, t) => a + Number(t.costo || 0), 0)
      const costoRepuestos = (m.repuestos || []).reduce(
        (a, r) => a + Number(r.cantidad || 1) * Number(r.costo_unitario || 0),
        0
      )
      const desglosado = costoTareas + Number(m.costo_mano_obra || 0) + costoRepuestos
      // El costo de cabecera de las OT cargadas por la app ya es MO + repuestos
      // (sin tareas); tomar el mayor entre cabecera y desglose suma lo que falte
      // sin duplicar, y conserva las OT viejas que solo tienen costo de cabecera.
      const costo = Math.max(Number(m.costo || 0), desglosado)
      costoYTD += costo
      if (m.fecha.slice(0, 7) === mesActual) costoMes += costo
      const mes = m.fecha.slice(0, 7)
      if (!porMesMap.has(mes))
        porMesMap.set(mes, { preventivo: 0, correctivo: 0, proactivo: 0 })
      porMesMap.get(mes)![m.tipo] += costo
    }

    const porMes = Array.from(porMesMap.entries())
      .map(([mes, v]) => ({ mes, ...v }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    return {
      data: {
        costoMes: Math.round(costoMes * 100) / 100,
        costoYTD: Math.round(costoYTD * 100) / 100,
        porMes,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SEGUIMIENTO DE FLOTA ====================

/** Días en que cada unidad ruteó (para utilización), desde una fecha. */
export async function getDiasRuteo(
  desde: string
): Promise<{ data: DiaRuteo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("vista_dias_ruteo")
      .select("dominio, fecha")
      .gte("fecha", desde)
    if (error) return { error: error.message }
    return { data: (data || []) as DiaRuteo[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getIndisponibilidades(): Promise<
  { data: FlotaIndisponibilidad[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_indisponibilidad")
      .select("*")
      .order("fecha_desde", { ascending: false })
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaIndisponibilidad[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function registrarIndisponibilidad(input: {
  dominio: string
  fecha_desde: string
  fecha_hasta: string
  motivo?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.dominio || !input.fecha_desde || !input.fecha_hasta)
      return { error: "Faltan datos (unidad y fechas)" }
    if (input.fecha_hasta < input.fecha_desde)
      return { error: "La fecha hasta no puede ser anterior a la desde" }
    const supabase = await createClient()
    const { error } = await supabase.from("flota_indisponibilidad").insert({
      dominio: input.dominio.toUpperCase(),
      fecha_desde: input.fecha_desde,
      fecha_hasta: input.fecha_hasta,
      motivo: input.motivo?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarIndisponibilidad(input: {
  id: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_indisponibilidad")
      .delete()
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== LECTURAS MANUALES (odómetro/horómetro) ====================

export interface RegistrarLecturaInput {
  dominio: string
  fecha: string
  valor: number
  observaciones?: string
}

/**
 * Registra una lectura manual de odómetro (km) u horómetro (hs) para unidades
 * sin fuente automática (autoelevadores sin checklist diario, camionetas del
 * depósito). Alimenta el "km/hs actual" y la proyección del service general.
 */
export async function registrarLecturaVehiculo(
  input: RegistrarLecturaInput
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const valor = Number(input.valor)
    if (!input.dominio.trim()) return { error: "Falta el dominio" }
    if (!Number.isFinite(valor) || valor < 0) return { error: "Lectura inválida" }
    const { error } = await supabase.from("vehiculos_lecturas").insert({
      dominio: input.dominio.trim().toUpperCase(),
      fecha: input.fecha,
      valor,
      observaciones: input.observaciones?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

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
import { startOfYear, today, daysBetween } from "@/lib/vehiculos/lecturas"
import type {
  CostosMantenimiento,
  EstadoPlanVehiculo,
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
      }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const { estados, tareas, overrides } = await loadEstadoPlan()
    return { data: { estados, tareas, overrides } }
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
      supabase.from("mantenimiento_novedades").select("estado, fecha"),
      supabase
        .from("mantenimiento_llantas")
        .select("dominio, posicion, fecha, profundidad_mm, presion_psi"),
      supabase.from("mantenimiento_repuestos").select("stock_actual, stock_min, stock_max"),
      supabase.from("mantenimiento_ordenes_compra").select("estado"),
    ])
    for (const r of [
      catsRes, reqsRes, otRes, chkRes, vehRes, novRes, llantasRes, repuestosRes, ocRes,
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

    return { data: { programacion, documentos, resumen } }
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
      .select("*, tareas:mantenimiento_realizado_tareas(*)")
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

interface MantenimientoTareaInput {
  tareaId?: string
  descripcion?: string
  costo?: number
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
  observaciones?: string
  es_service_general?: boolean
  tareas: MantenimientoTareaInput[]
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
        observaciones: input.observaciones?.trim() || null,
        es_service_general: input.es_service_general ?? false,
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
  observaciones?: string
  es_service_general?: boolean
  /** Si se pasa, reemplaza el detalle completo de tareas. */
  tareas?: MantenimientoTareaInput[]
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
    if (input.observaciones !== undefined)
      patch.observaciones = input.observaciones?.trim() || null
    if (input.es_service_general !== undefined)
      patch.es_service_general = input.es_service_general

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
    const itemsNoOk: ChecklistItemNoOk[] = ((respRes.data || []) as unknown as RespRow[])
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
      .select("fecha, tipo, costo, tareas:mantenimiento_realizado_tareas(costo)")
      .neq("estado", "cancelado")
      .gte("fecha", inicioAnio)
    if (error) return { error: error.message }

    let costoMes = 0
    let costoYTD = 0
    const porMesMap = new Map<string, { preventivo: number; correctivo: number }>()
    for (const m of (data || []) as Array<{
      fecha: string
      tipo: MantenimientoTipo
      costo: number | null
      tareas: { costo: number | null }[]
    }>) {
      const costoTareas = (m.tareas || []).reduce((a, t) => a + Number(t.costo || 0), 0)
      const costo = m.costo != null ? Number(m.costo) : costoTareas
      costoYTD += costo
      if (m.fecha.slice(0, 7) === mesActual) costoMes += costo
      const mes = m.fecha.slice(0, 7)
      if (!porMesMap.has(mes)) porMesMap.set(mes, { preventivo: 0, correctivo: 0 })
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

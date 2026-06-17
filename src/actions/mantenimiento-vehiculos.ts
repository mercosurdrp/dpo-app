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

export async function getTableroOperativo(): Promise<
  | { data: { programacion: ServiceGeneralUnidad[]; documentos: DocumentoVencimiento[] } }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const programacion = await loadServiceGeneral()

    // Documentos (seguros/VTV/SENASA/extintores) viven en requisitos_legales,
    // categorías con identificador = vehículo; el campo `nombre` = patente.
    const { data: cats, error: catErr } = await supabase
      .from("requisitos_legales_categorias")
      .select("id, nombre, tipo_identificador")
      .eq("tipo_identificador", "vehiculo")
    if (catErr) throw new Error(catErr.message)

    const catNombre = new Map<string, string>(
      ((cats || []) as Array<{ id: string; nombre: string }>).map((c) => [c.id, c.nombre])
    )

    const documentos: DocumentoVencimiento[] = []
    if (catNombre.size > 0) {
      const hoy = today()
      const { data: reqs, error: reqErr } = await supabase
        .from("requisitos_legales")
        .select("id, nombre, fecha_vencimiento, categoria_id")
        .in("categoria_id", [...catNombre.keys()])
        .not("fecha_vencimiento", "is", null)
        .order("fecha_vencimiento")
      if (reqErr) throw new Error(reqErr.message)

      for (const r of (reqs || []) as Array<{
        id: string
        nombre: string
        fecha_vencimiento: string
        categoria_id: string
      }>) {
        const venc = r.fecha_vencimiento.slice(0, 10)
        const dias = venc >= hoy ? daysBetween(hoy, venc) : -daysBetween(venc, hoy)
        documentos.push({
          id: r.id,
          dominio: r.nombre,
          categoria: catNombre.get(r.categoria_id) ?? "",
          fechaVencimiento: venc,
          diasRestantes: dias,
          estado: estadoPorDias(dias),
        })
      }
    }

    return { data: { programacion, documentos } }
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

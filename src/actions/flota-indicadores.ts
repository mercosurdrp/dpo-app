"use server"

// Tablero de Indicadores de Flota: metas configurables por KPI y planes de
// acción por KPI + mes. Planes: clon del patrón TML/TI (tml-plan-accion.ts)
// con discriminador `kpi`.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

export type FlotaKpi =
  | "disponibilidad"
  | "utilizacion"
  | "costo_total"
  | "pct_preventivo"
  | "cumplimiento_plan"
  | "services_vencidos"

export type PlanFlotaEstado = "abierto" | "en_progreso" | "cerrado"
export type PlanFlotaItemEstado = "pendiente" | "en_progreso" | "completado"

export interface FlotaMeta {
  kpi: FlotaKpi
  meta: number | null
  comparador: ">=" | "<="
  unidad: string
}

export interface FlotaPlanAccion {
  id: string
  kpi: FlotaKpi
  mes: number
  year: number
  valor_mes: number | null
  meta_mes: number | null
  causa_raiz: string
  estado: PlanFlotaEstado
  fecha_cierre: string | null
  resultado_cierre: string | null
  evidencia_cierre_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FlotaPlanAccionItem {
  id: string
  plan_id: string
  accion: string
  responsable: string
  fecha_compromiso: string
  estado: PlanFlotaItemEstado
  fecha_completado: string | null
  observaciones: string | null
  orden: number
  created_at: string
}

export interface FlotaPlanConItems extends FlotaPlanAccion {
  items: FlotaPlanAccionItem[]
}

// ==================== METAS ====================

export async function getFlotaMetas(): Promise<
  { data: FlotaMeta[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_metas")
      .select("kpi, meta, comparador, unidad")
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaMeta[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateFlotaMeta(input: {
  kpi: FlotaKpi
  meta: number | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_metas")
      .update({ meta: input.meta, updated_by: profile.id })
      .eq("kpi", input.kpi)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== PLANES ====================

export async function getFlotaPlanes(): Promise<
  { data: FlotaPlanConItems[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [planRes, itemRes] = await Promise.all([
      supabase
        .from("flota_plan_accion")
        .select("*")
        .order("year", { ascending: false })
        .order("mes", { ascending: false }),
      supabase
        .from("flota_plan_accion_items")
        .select("*")
        .order("orden", { ascending: true }),
    ])
    if (planRes.error) return { error: planRes.error.message }
    if (itemRes.error) return { error: itemRes.error.message }

    const items = (itemRes.data || []) as FlotaPlanAccionItem[]
    const itemsByPlan = new Map<string, FlotaPlanAccionItem[]>()
    for (const it of items) {
      if (!itemsByPlan.has(it.plan_id)) itemsByPlan.set(it.plan_id, [])
      itemsByPlan.get(it.plan_id)!.push(it)
    }
    const planes = ((planRes.data || []) as FlotaPlanAccion[]).map((p) => ({
      ...p,
      items: itemsByPlan.get(p.id) || [],
    }))
    return { data: planes }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createFlotaPlan(input: {
  kpi: FlotaKpi
  mes: number
  year: number
  valorMes: number | null
  metaMes: number | null
  causaRaiz: string
  items: Array<{ accion: string; responsable: string; fechaCompromiso: string }>
}): Promise<{ data: FlotaPlanAccion } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: plan, error: errPlan } = await supabase
      .from("flota_plan_accion")
      .insert({
        kpi: input.kpi,
        mes: input.mes,
        year: input.year,
        valor_mes: input.valorMes,
        meta_mes: input.metaMes,
        causa_raiz: input.causaRaiz.trim(),
        estado: "abierto" as PlanFlotaEstado,
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (errPlan) return { error: errPlan.message }

    if (input.items.length > 0) {
      const payload = input.items.map((it, idx) => ({
        plan_id: plan.id,
        accion: it.accion.trim(),
        responsable: it.responsable.trim(),
        fecha_compromiso: it.fechaCompromiso,
        estado: "pendiente" as PlanFlotaItemEstado,
        orden: idx,
      }))
      const { error: errItems } = await supabase
        .from("flota_plan_accion_items")
        .insert(payload)
      if (errItems) {
        await supabase.from("flota_plan_accion").delete().eq("id", plan.id)
        return { error: errItems.message }
      }
    }

    return { data: plan as FlotaPlanAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function cerrarFlotaPlan(
  id: string,
  resultadoCierre: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_plan_accion")
      .update({
        estado: "cerrado" as PlanFlotaEstado,
        fecha_cierre: new Date().toISOString().slice(0, 10),
        resultado_cierre: resultadoCierre.trim(),
      })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteFlotaPlan(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { error } = await supabase.from("flota_plan_accion").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ITEMS ====================

export async function addFlotaPlanItem(input: {
  planId: string
  accion: string
  responsable: string
  fechaCompromiso: string
}): Promise<{ data: FlotaPlanAccionItem } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { count } = await supabase
      .from("flota_plan_accion_items")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", input.planId)

    const { data, error } = await supabase
      .from("flota_plan_accion_items")
      .insert({
        plan_id: input.planId,
        accion: input.accion.trim(),
        responsable: input.responsable.trim(),
        fecha_compromiso: input.fechaCompromiso,
        estado: "pendiente" as PlanFlotaItemEstado,
        orden: count ?? 0,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }

    // Plan con items en marcha: pasa de abierto a en_progreso.
    await supabase
      .from("flota_plan_accion")
      .update({ estado: "en_progreso" as PlanFlotaEstado })
      .eq("id", input.planId)
      .eq("estado", "abierto")

    return { data: data as FlotaPlanAccionItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateFlotaPlanItem(input: {
  id: string
  estado?: PlanFlotaItemEstado
  observaciones?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.estado !== undefined) {
      update.estado = input.estado
      update.fecha_completado =
        input.estado === "completado" ? new Date().toISOString().slice(0, 10) : null
    }
    if (input.observaciones !== undefined) update.observaciones = input.observaciones
    const { error } = await supabase
      .from("flota_plan_accion_items")
      .update(update)
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteFlotaPlanItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_plan_accion_items")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

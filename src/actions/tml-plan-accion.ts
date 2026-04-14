"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  TmlPlanAccion,
  TmlPlanAccionItem,
  TmlPlanResumen,
  PlanTmlEstado,
  PlanTmlItemEstado,
  RegistroVehiculo,
} from "@/types/database"

const TML_META_MINUTOS = 30
const PCT_META_MINIMO = 65

function mesFueraDeMeta(promedio: number, pct: number): boolean {
  return promedio > TML_META_MINUTOS || pct < PCT_META_MINIMO
}

// ==================== RESUMEN mensual + plan asociado ====================
export async function getTmlPlanesResumen(): Promise<
  { data: TmlPlanResumen[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [regRes, planRes, itemRes] = await Promise.all([
      supabase
        .from("registros_vehiculos")
        .select("fecha,tml_minutos")
        .eq("tipo", "egreso")
        .not("tml_minutos", "is", null)
        .order("fecha", { ascending: true }),
      supabase
        .from("tml_plan_accion")
        .select("*")
        .order("year", { ascending: true })
        .order("mes", { ascending: true }),
      supabase.from("tml_plan_accion_items").select("*"),
    ])

    if (regRes.error) return { error: regRes.error.message }
    if (planRes.error) return { error: planRes.error.message }
    if (itemRes.error) return { error: itemRes.error.message }

    const registros = (regRes.data || []) as Pick<RegistroVehiculo, "fecha" | "tml_minutos">[]
    const planes = (planRes.data || []) as TmlPlanAccion[]
    const items = (itemRes.data || []) as TmlPlanAccionItem[]

    // Agrupar por mes
    type Group = { tmls: number[]; year: number; mes: number }
    const mensualMap = new Map<string, Group>()
    for (const r of registros) {
      const d = new Date(r.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key)) mensualMap.set(key, { tmls: [], year, mes })
      mensualMap.get(key)!.tmls.push(r.tml_minutos!)
    }

    const planByKey = new Map(planes.map((p) => [`${p.year}-${p.mes}`, p]))
    const itemsByPlan = new Map<string, TmlPlanAccionItem[]>()
    for (const it of items) {
      if (!itemsByPlan.has(it.plan_id)) itemsByPlan.set(it.plan_id, [])
      itemsByPlan.get(it.plan_id)!.push(it)
    }

    const resumen: TmlPlanResumen[] = Array.from(mensualMap.values()).map((g) => {
      const promedio = Math.round(g.tmls.reduce((a, b) => a + b, 0) / g.tmls.length)
      const dm = g.tmls.filter((t) => t <= TML_META_MINUTOS).length
      const pct = Math.round((dm / g.tmls.length) * 100)
      const plan = planByKey.get(`${g.year}-${g.mes}`) ?? null
      const itemsPlan = plan ? itemsByPlan.get(plan.id) || [] : []
      return {
        year: g.year,
        mes: g.mes,
        promedio_tml: promedio,
        pct_dentro_meta: pct,
        fuera_meta: mesFueraDeMeta(promedio, pct),
        plan,
        items_total: itemsPlan.length,
        items_completados: itemsPlan.filter((i) => i.estado === "completado").length,
      }
    })

    // Orden descendente: más reciente arriba
    resumen.sort((a, b) => (b.year - a.year) * 100 + (b.mes - a.mes))

    return { data: resumen }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CRUD PLAN ====================
interface CreatePlanInput {
  mes: number
  year: number
  promedioTmlMes: number
  pctDentroMetaMes: number
  causaRaiz: string
  items: Array<{
    accion: string
    responsable: string
    fechaCompromiso: string
  }>
}

export async function createTmlPlan(
  input: CreatePlanInput,
): Promise<{ data: TmlPlanAccion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: plan, error: errPlan } = await supabase
      .from("tml_plan_accion")
      .insert({
        mes: input.mes,
        year: input.year,
        promedio_tml_mes: input.promedioTmlMes,
        pct_dentro_meta_mes: input.pctDentroMetaMes,
        causa_raiz: input.causaRaiz.trim(),
        estado: "abierto" as PlanTmlEstado,
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
        estado: "pendiente" as PlanTmlItemEstado,
        orden: idx,
      }))
      const { error: errItems } = await supabase
        .from("tml_plan_accion_items")
        .insert(payload)
      if (errItems) {
        await supabase.from("tml_plan_accion").delete().eq("id", plan.id)
        return { error: errItems.message }
      }
    }

    return { data: plan as TmlPlanAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getTmlPlanById(
  id: string,
): Promise<
  | { data: { plan: TmlPlanAccion; items: TmlPlanAccionItem[] } }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [planRes, itemsRes] = await Promise.all([
      supabase.from("tml_plan_accion").select("*").eq("id", id).single(),
      supabase
        .from("tml_plan_accion_items")
        .select("*")
        .eq("plan_id", id)
        .order("orden", { ascending: true }),
    ])
    if (planRes.error) return { error: planRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }
    return {
      data: {
        plan: planRes.data as TmlPlanAccion,
        items: (itemsRes.data || []) as TmlPlanAccionItem[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateTmlPlanCausaRaiz(
  id: string,
  causaRaiz: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("tml_plan_accion")
      .update({ causa_raiz: causaRaiz.trim() })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function cerrarTmlPlan(
  id: string,
  resultadoCierre: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("tml_plan_accion")
      .update({
        estado: "cerrado" as PlanTmlEstado,
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

export async function deleteTmlPlan(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.from("tml_plan_accion").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CRUD ITEMS ====================
interface AddItemInput {
  planId: string
  accion: string
  responsable: string
  fechaCompromiso: string
}

export async function addTmlPlanItem(
  input: AddItemInput,
): Promise<{ data: TmlPlanAccionItem } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { count } = await supabase
      .from("tml_plan_accion_items")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", input.planId)

    const { data, error } = await supabase
      .from("tml_plan_accion_items")
      .insert({
        plan_id: input.planId,
        accion: input.accion.trim(),
        responsable: input.responsable.trim(),
        fecha_compromiso: input.fechaCompromiso,
        estado: "pendiente" as PlanTmlItemEstado,
        orden: count ?? 0,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    // Si el plan estaba abierto y ya tiene items, pasarlo a en_progreso
    await supabase
      .from("tml_plan_accion")
      .update({ estado: "en_progreso" as PlanTmlEstado })
      .eq("id", input.planId)
      .eq("estado", "abierto")

    return { data: data as TmlPlanAccionItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface UpdateItemInput {
  id: string
  accion?: string
  responsable?: string
  fechaCompromiso?: string
  estado?: PlanTmlItemEstado
  fechaCompletado?: string | null
  observaciones?: string | null
}

export async function updateTmlPlanItem(
  input: UpdateItemInput,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.accion !== undefined) update.accion = input.accion.trim()
    if (input.responsable !== undefined) update.responsable = input.responsable.trim()
    if (input.fechaCompromiso !== undefined) update.fecha_compromiso = input.fechaCompromiso
    if (input.estado !== undefined) {
      update.estado = input.estado
      if (input.estado === "completado" && input.fechaCompletado === undefined) {
        update.fecha_completado = new Date().toISOString().slice(0, 10)
      }
    }
    if (input.fechaCompletado !== undefined) update.fecha_completado = input.fechaCompletado
    if (input.observaciones !== undefined) update.observaciones = input.observaciones

    const { error } = await supabase
      .from("tml_plan_accion_items")
      .update(update)
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteTmlPlanItem(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.from("tml_plan_accion_items").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

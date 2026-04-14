"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  OwdItem,
  OwdObservacion,
  OwdRespuesta,
  OwdResultado,
  OwdMensual,
  OwdItemStats,
} from "@/types/database"

const TEMPLATE_VERSION = 1

export async function getOwdItems(): Promise<
  { data: OwdItem[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_items")
      .select("*")
      .eq("active", true)
      .eq("version", TEMPLATE_VERSION)
      .order("orden", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data || []) as OwdItem[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface CreateObservacionInput {
  fecha: string
  supervisor: string
  empleadoObservado: string
  rolEmpleado?: string
  dominio?: string
  respuestas: Array<{
    item_id: string
    resultado: OwdResultado
    comentario?: string
  }>
  accionCorrectiva?: string
  observaciones?: string
}

export async function createObservacion(
  input: CreateObservacionInput,
): Promise<{ data: OwdObservacion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const totalItems = input.respuestas.length
    const totalOk = input.respuestas.filter((r) => r.resultado === "ok").length
    const totalNook = input.respuestas.filter((r) => r.resultado === "nook").length
    const totalNa = input.respuestas.filter((r) => r.resultado === "na").length
    const evaluables = totalOk + totalNook
    const pct = evaluables === 0 ? 0 : Math.round((totalOk / evaluables) * 10000) / 100

    const { data: obs, error: errObs } = await supabase
      .from("owd_observaciones")
      .insert({
        fecha: input.fecha,
        supervisor: input.supervisor.trim(),
        empleado_observado: input.empleadoObservado.trim(),
        rol_empleado: input.rolEmpleado?.trim() || null,
        dominio: input.dominio?.trim().toUpperCase() || null,
        template_version: TEMPLATE_VERSION,
        total_items: totalItems,
        total_ok: totalOk,
        total_nook: totalNook,
        total_na: totalNa,
        pct_cumplimiento: pct,
        accion_correctiva: input.accionCorrectiva?.trim() || null,
        observaciones: input.observaciones?.trim() || null,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (errObs) return { error: errObs.message }

    const respuestasPayload = input.respuestas.map((r) => ({
      observacion_id: obs.id,
      item_id: r.item_id,
      resultado: r.resultado,
      comentario: r.comentario?.trim() || null,
    }))

    const { error: errResp } = await supabase
      .from("owd_respuestas")
      .insert(respuestasPayload)

    if (errResp) {
      await supabase.from("owd_observaciones").delete().eq("id", obs.id)
      return { error: errResp.message }
    }

    return { data: obs as OwdObservacion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getObservaciones(
  filters?: { limit?: number; supervisor?: string; empleado?: string },
): Promise<{ data: OwdObservacion[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let query = supabase
      .from("owd_observaciones")
      .select("*")
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false })

    if (filters?.supervisor) query = query.eq("supervisor", filters.supervisor)
    if (filters?.empleado) query = query.eq("empleado_observado", filters.empleado)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as OwdObservacion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getObservacionById(
  id: string,
): Promise<
  | { data: { observacion: OwdObservacion; respuestas: OwdRespuesta[]; items: OwdItem[] } }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [obsRes, respRes, itemsRes] = await Promise.all([
      supabase.from("owd_observaciones").select("*").eq("id", id).single(),
      supabase.from("owd_respuestas").select("*").eq("observacion_id", id),
      supabase.from("owd_items").select("*").order("orden", { ascending: true }),
    ])

    if (obsRes.error) return { error: obsRes.error.message }
    if (respRes.error) return { error: respRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }

    return {
      data: {
        observacion: obsRes.data as OwdObservacion,
        respuestas: (respRes.data || []) as OwdRespuesta[],
        items: (itemsRes.data || []) as OwdItem[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteObservacion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.from("owd_observaciones").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getOwdKpis(): Promise<
  | {
      data: {
        totalObservaciones: number
        promedioCumplimiento: number
        obsMesActual: number
        metaMensual: number
        mensual: OwdMensual[]
        porEtapa: Array<{ etapa: string; pct: number; total: number }>
        itemsMasFallados: OwdItemStats[]
      }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [obsRes, respRes, itemsRes] = await Promise.all([
      supabase
        .from("owd_observaciones")
        .select("*")
        .order("fecha", { ascending: true }),
      supabase.from("owd_respuestas").select("*"),
      supabase.from("owd_items").select("*").eq("active", true),
    ])

    if (obsRes.error) return { error: obsRes.error.message }
    if (respRes.error) return { error: respRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }

    const observaciones = (obsRes.data || []) as OwdObservacion[]
    const respuestas = (respRes.data || []) as OwdRespuesta[]
    const items = (itemsRes.data || []) as OwdItem[]

    if (observaciones.length === 0) {
      return {
        data: {
          totalObservaciones: 0,
          promedioCumplimiento: 0,
          obsMesActual: 0,
          metaMensual: 8,
          mensual: [],
          porEtapa: [],
          itemsMasFallados: [],
        },
      }
    }

    const totalObservaciones = observaciones.length
    const promedioCumplimiento =
      Math.round(
        (observaciones.reduce((a, b) => a + Number(b.pct_cumplimiento), 0) / totalObservaciones) *
          100,
      ) / 100

    const now = new Date()
    const mesActual = now.getMonth() + 1
    const yearActual = now.getFullYear()
    const obsMesActual = observaciones.filter((o) => {
      const d = new Date(o.fecha + "T12:00:00")
      return d.getMonth() + 1 === mesActual && d.getFullYear() === yearActual
    }).length

    // Mensual
    const mensualMap = new Map<
      string,
      { total: number; sumaPct: number; year: number; mes: number }
    >()
    for (const o of observaciones) {
      const d = new Date(o.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key)) mensualMap.set(key, { total: 0, sumaPct: 0, year, mes })
      const g = mensualMap.get(key)!
      g.total += 1
      g.sumaPct += Number(o.pct_cumplimiento)
    }
    const mensual: OwdMensual[] = Array.from(mensualMap.values()).map((g) => ({
      mes: g.mes,
      year: g.year,
      total_observaciones: g.total,
      promedio_cumplimiento: Math.round((g.sumaPct / g.total) * 100) / 100,
    }))

    // Por etapa y por ítem
    const itemsById = new Map(items.map((i) => [i.id, i]))
    const etapaMap = new Map<string, { ok: number; nook: number }>()
    const itemMap = new Map<string, { ok: number; nook: number; na: number }>()

    for (const r of respuestas) {
      const it = itemsById.get(r.item_id)
      if (!it) continue
      if (!etapaMap.has(it.etapa)) etapaMap.set(it.etapa, { ok: 0, nook: 0 })
      if (!itemMap.has(r.item_id)) itemMap.set(r.item_id, { ok: 0, nook: 0, na: 0 })
      const eg = etapaMap.get(it.etapa)!
      const ig = itemMap.get(r.item_id)!
      if (r.resultado === "ok") {
        eg.ok += 1
        ig.ok += 1
      } else if (r.resultado === "nook") {
        eg.nook += 1
        ig.nook += 1
      } else {
        ig.na += 1
      }
    }

    const porEtapa = Array.from(etapaMap.entries()).map(([etapa, g]) => {
      const total = g.ok + g.nook
      return {
        etapa,
        total,
        pct: total === 0 ? 0 : Math.round((g.ok / total) * 10000) / 100,
      }
    })

    const itemsMasFallados: OwdItemStats[] = Array.from(itemMap.entries())
      .map(([item_id, g]) => {
        const it = itemsById.get(item_id)!
        const total = g.ok + g.nook
        return {
          item_id,
          etapa: it.etapa,
          texto: it.texto,
          total_ok: g.ok,
          total_nook: g.nook,
          total_na: g.na,
          pct_cumplimiento: total === 0 ? 0 : Math.round((g.ok / total) * 10000) / 100,
        }
      })
      .filter((i) => i.total_nook > 0)
      .sort((a, b) => b.total_nook - a.total_nook)
      .slice(0, 5)

    return {
      data: {
        totalObservaciones,
        promedioCumplimiento,
        obsMesActual,
        metaMensual: 8,
        mensual,
        porEtapa,
        itemsMasFallados,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

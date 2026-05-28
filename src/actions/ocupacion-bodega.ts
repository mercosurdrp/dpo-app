"use server"
/**
 * Consultas para el reporte de Ocupación de Bodega.
 * El cálculo está pre-agregado en `ocupacion_bodega_diaria` (lo carga el
 * cron de rechazos). Esta capa sólo lee y agrega para el dashboard.
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

const TARGET_CEQ = 450

export interface ViajeOB {
  fecha: string
  patente: string
  ceq_total: number
  bultos_total: number
  hl_total: number
  lineas: number
  skus_distintos: number
  ob_pct_target: number
}

export interface OBKpis {
  desde: string
  hasta: string
  target: number
  viajes: number
  ceq_promedio: number
  ceq_total: number
  pct_meta: number              // pct viajes que alcanzan 450 CEq
  ceq_max: number
  ceq_min: number
  patente_top: string | null
  hl_total: number
  bultos_total: number
}

export interface PatenteSummary {
  patente: string
  viajes: number
  ceq_promedio: number
  ceq_total: number
  ceq_max: number
  ceq_min: number
  pct_meta: number
}

export interface DiaSummary {
  fecha: string
  viajes: number
  ceq_promedio: number
  ceq_total: number
}

export interface MesSummary {
  mes: string  // YYYY-MM
  viajes: number
  ceq_promedio: number
  ceq_total: number
  patentes_distintas: number
  pct_meta: number
}

function defaultRange(): { desde: string; hasta: string } {
  const hoy = new Date()
  const m0 = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return {
    desde: m0.toISOString().slice(0, 10),
    hasta: hoy.toISOString().slice(0, 10),
  }
}

export async function getOBKpis(filters?: { desde?: string; hasta?: string; patente?: string }): Promise<
  { data: OBKpis } | { error: string }
> {
  try {
    await requireAuth()
    const sb = await createClient()
    const { desde, hasta } = { ...defaultRange(), ...(filters ?? {}) }

    let q = sb.from("ocupacion_bodega_diaria")
      .select("ceq_total, bultos_total, hl_total, patente")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .gt("ceq_total", 0)
    if (filters?.patente) q = q.eq("patente", filters.patente)

    const { data, error } = await q
    if (error) return { error: error.message }
    const rows = data ?? []
    if (rows.length === 0) {
      return { data: { desde, hasta, target: TARGET_CEQ, viajes: 0, ceq_promedio: 0, ceq_total: 0, pct_meta: 0, ceq_max: 0, ceq_min: 0, patente_top: null, hl_total: 0, bultos_total: 0 } }
    }
    const ceqArr = rows.map(r => Number(r.ceq_total))
    const ceqTotal = ceqArr.reduce((a, b) => a + b, 0)
    const ceqProm = ceqTotal / ceqArr.length
    const enMeta = ceqArr.filter(x => x >= TARGET_CEQ).length
    const max = Math.max(...ceqArr)
    const min = Math.min(...ceqArr)
    const topRow = rows.find(r => Number(r.ceq_total) === max)
    return {
      data: {
        desde, hasta, target: TARGET_CEQ,
        viajes: rows.length,
        ceq_promedio: Math.round(ceqProm * 10) / 10,
        ceq_total: Math.round(ceqTotal * 10) / 10,
        pct_meta: Math.round((enMeta / rows.length) * 1000) / 10,
        ceq_max: Math.round(max * 10) / 10,
        ceq_min: Math.round(min * 10) / 10,
        patente_top: topRow?.patente ?? null,
        hl_total: Math.round(rows.reduce((a, r) => a + Number(r.hl_total), 0) * 100) / 100,
        bultos_total: Math.round(rows.reduce((a, r) => a + Number(r.bultos_total), 0) * 10) / 10,
      },
    }
  } catch (e) { return { error: e instanceof Error ? e.message : "Error" } }
}

export async function getOBViajes(filters?: { desde?: string; hasta?: string; patente?: string; limit?: number }): Promise<
  { data: ViajeOB[] } | { error: string }
> {
  try {
    await requireAuth()
    const sb = await createClient()
    const { desde, hasta } = { ...defaultRange(), ...(filters ?? {}) }
    let q = sb.from("ocupacion_bodega_diaria")
      .select("fecha, patente, ceq_total, bultos_total, hl_total, lineas, skus_distintos, ob_pct_target")
      .gte("fecha", desde).lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("ceq_total", { ascending: false })
      .limit(filters?.limit ?? 500)
    if (filters?.patente) q = q.eq("patente", filters.patente)
    const { data, error } = await q
    if (error) return { error: error.message }
    return { data: (data ?? []) as ViajeOB[] }
  } catch (e) { return { error: e instanceof Error ? e.message : "Error" } }
}

export async function getOBPorPatente(filters?: { desde?: string; hasta?: string }): Promise<
  { data: PatenteSummary[] } | { error: string }
> {
  try {
    await requireAuth()
    const sb = await createClient()
    const { desde, hasta } = { ...defaultRange(), ...(filters ?? {}) }
    const { data, error } = await sb.from("ocupacion_bodega_diaria")
      .select("patente, ceq_total")
      .gte("fecha", desde).lte("fecha", hasta)
      .gt("ceq_total", 0)
    if (error) return { error: error.message }
    const rows = data ?? []
    const map = new Map<string, number[]>()
    for (const r of rows) {
      const arr = map.get(r.patente) ?? []
      arr.push(Number(r.ceq_total))
      map.set(r.patente, arr)
    }
    const out: PatenteSummary[] = []
    for (const [patente, ceqs] of map.entries()) {
      const total = ceqs.reduce((a, b) => a + b, 0)
      const prom = total / ceqs.length
      const enMeta = ceqs.filter(x => x >= TARGET_CEQ).length
      out.push({
        patente,
        viajes: ceqs.length,
        ceq_total: Math.round(total * 10) / 10,
        ceq_promedio: Math.round(prom * 10) / 10,
        ceq_max: Math.round(Math.max(...ceqs) * 10) / 10,
        ceq_min: Math.round(Math.min(...ceqs) * 10) / 10,
        pct_meta: Math.round((enMeta / ceqs.length) * 1000) / 10,
      })
    }
    out.sort((a, b) => b.ceq_promedio - a.ceq_promedio)
    return { data: out }
  } catch (e) { return { error: e instanceof Error ? e.message : "Error" } }
}

export async function getOBPorDia(filters?: { desde?: string; hasta?: string; patente?: string }): Promise<
  { data: DiaSummary[] } | { error: string }
> {
  try {
    await requireAuth()
    const sb = await createClient()
    const { desde, hasta } = { ...defaultRange(), ...(filters ?? {}) }
    let q = sb.from("ocupacion_bodega_diaria")
      .select("fecha, ceq_total")
      .gte("fecha", desde).lte("fecha", hasta)
      .gt("ceq_total", 0)
    if (filters?.patente) q = q.eq("patente", filters.patente)
    const { data, error } = await q
    if (error) return { error: error.message }
    const rows = data ?? []
    const map = new Map<string, number[]>()
    for (const r of rows) {
      const arr = map.get(r.fecha) ?? []
      arr.push(Number(r.ceq_total))
      map.set(r.fecha, arr)
    }
    const out: DiaSummary[] = [...map.entries()]
      .map(([fecha, ceqs]) => ({
        fecha,
        viajes: ceqs.length,
        ceq_total: Math.round(ceqs.reduce((a, b) => a + b, 0) * 10) / 10,
        ceq_promedio: Math.round((ceqs.reduce((a, b) => a + b, 0) / ceqs.length) * 10) / 10,
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    return { data: out }
  } catch (e) { return { error: e instanceof Error ? e.message : "Error" } }
}

export async function getOBPorMes(filters?: { meses?: number }): Promise<
  { data: MesSummary[] } | { error: string }
> {
  try {
    await requireAuth()
    const sb = await createClient()
    const meses = filters?.meses ?? 12
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 1).toISOString().slice(0, 10)
    const { data, error } = await sb.from("ocupacion_bodega_diaria")
      .select("fecha, patente, ceq_total")
      .gte("fecha", desde)
      .gt("ceq_total", 0)
    if (error) return { error: error.message }
    const rows = data ?? []
    const map = new Map<string, { ceqs: number[]; patentes: Set<string> }>()
    for (const r of rows) {
      const mes = r.fecha.slice(0, 7)
      const slot = map.get(mes) ?? { ceqs: [], patentes: new Set() }
      slot.ceqs.push(Number(r.ceq_total))
      slot.patentes.add(r.patente)
      map.set(mes, slot)
    }
    const out: MesSummary[] = [...map.entries()].map(([mes, s]) => {
      const total = s.ceqs.reduce((a, b) => a + b, 0)
      const enMeta = s.ceqs.filter(x => x >= TARGET_CEQ).length
      return {
        mes,
        viajes: s.ceqs.length,
        ceq_total: Math.round(total * 10) / 10,
        ceq_promedio: Math.round((total / s.ceqs.length) * 10) / 10,
        patentes_distintas: s.patentes.size,
        pct_meta: Math.round((enMeta / s.ceqs.length) * 1000) / 10,
      }
    }).sort((a, b) => a.mes.localeCompare(b.mes))
    return { data: out }
  } catch (e) { return { error: e instanceof Error ? e.message : "Error" } }
}

export async function getPatentesDisponibles(): Promise<{ data: string[] } | { error: string }> {
  try {
    await requireAuth()
    const sb = await createClient()
    const { data, error } = await sb.from("ocupacion_bodega_diaria")
      .select("patente").gt("ceq_total", 0).order("patente")
    if (error) return { error: error.message }
    return { data: [...new Set((data ?? []).map(r => r.patente))] }
  } catch (e) { return { error: e instanceof Error ? e.message : "Error" } }
}

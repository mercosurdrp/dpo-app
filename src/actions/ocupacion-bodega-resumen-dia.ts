"use server"
/**
 * Detalle de Ocupación de Bodega de un día específico (drill-down del tablero
 * de reuniones). Devuelve cada viaje (patente) con CEq, % de ocupación, bultos, etc.
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  CAPACIDAD_CEQ,
  MINIMO_CEQ,
  alcanzaMinimo,
  obPct,
} from "@/lib/ocupacion-bodega"

export interface ViajeDelDia {
  patente: string
  ceq_total: number
  bultos_total: number
  hl_total: number
  peso_total: number   // kg de la carga (Σ peso_bulto × bultos)
  lineas: number
  skus_distintos: number
  ob_pct: number
}

export interface OBResumenDia {
  fecha: string
  /** CEq que entran en el camión: el 100% de ocupación. */
  capacidad: number
  /** Carga mínima esperada por viaje. */
  minimo: number
  total_viajes: number
  ceq_total: number
  ceq_promedio: number
  pct_promedio: number   // promedio simple de OB% por viaje (sobre la capacidad)
  en_meta: number        // viajes que alcanzan la carga mínima
  patente_top: string | null
  ceq_max: number
  ceq_min: number
  viajes: ViajeDelDia[]
}

export async function getOcupacionBodegaResumenDia(
  fecha: string | null,
): Promise<{ data: OBResumenDia | null } | { error: string }> {
  try {
    await requireAuth()
    if (!fecha) return { data: null }
    const sb = await createClient()
    const { data, error } = await sb
      .from("ocupacion_bodega_diaria")
      .select("patente, ceq_total, bultos_total, hl_total, peso_total, lineas, skus_distintos")
      .eq("fecha", fecha)
      .gt("ceq_total", 0)
      .order("ceq_total", { ascending: false })
    if (error) return { error: error.message }
    const rows = (data ?? []) as Array<{
      patente: string
      ceq_total: number
      bultos_total: number
      hl_total: number
      peso_total: number | null
      lineas: number
      skus_distintos: number
    }>
    if (rows.length === 0) {
      return {
        data: {
          fecha, capacidad: CAPACIDAD_CEQ, minimo: MINIMO_CEQ,
          total_viajes: 0, ceq_total: 0, ceq_promedio: 0,
          pct_promedio: 0, en_meta: 0, patente_top: null, ceq_max: 0, ceq_min: 0,
          viajes: [],
        },
      }
    }
    const viajes: ViajeDelDia[] = rows.map(r => ({
      patente: r.patente,
      ceq_total: Number(r.ceq_total),
      bultos_total: Number(r.bultos_total),
      hl_total: Number(r.hl_total),
      peso_total: Number(r.peso_total ?? 0),
      lineas: r.lineas,
      skus_distintos: r.skus_distintos,
      // El % se calcula acá contra la capacidad real: la columna generada de la
      // base divide por el target viejo.
      ob_pct: obPct(r.ceq_total),
    }))
    const ceqs = viajes.map(v => v.ceq_total)
    const ceqTotal = ceqs.reduce((a, b) => a + b, 0)
    const ceqProm = ceqTotal / ceqs.length
    const pctProm = viajes.reduce((a, v) => a + v.ob_pct, 0) / viajes.length
    const enMeta = viajes.filter(v => alcanzaMinimo(v.ceq_total)).length
    return {
      data: {
        fecha,
        capacidad: CAPACIDAD_CEQ,
        minimo: MINIMO_CEQ,
        total_viajes: viajes.length,
        ceq_total: Math.round(ceqTotal * 10) / 10,
        ceq_promedio: Math.round(ceqProm * 10) / 10,
        pct_promedio: Math.round(pctProm * 10) / 10,
        en_meta: enMeta,
        patente_top: viajes[0]?.patente ?? null,
        ceq_max: Math.round(Math.max(...ceqs) * 10) / 10,
        ceq_min: Math.round(Math.min(...ceqs) * 10) / 10,
        viajes,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error" }
  }
}

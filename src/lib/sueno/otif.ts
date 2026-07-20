/**
 * OTIF e In-Full del Árbol del Sueño, con la definición del negocio:
 *
 *   In Full = (rechazos + stock out + cancelaciones) ÷ bultos vendidos
 *   OTIF    = In Full + VRL + VRC                    (el On Time)
 *
 * Los dos se publican como % de PÉRDIDA (menos es mejor). NO se hace
 * "100 − resultado".
 *
 * Por qué vive acá y no en una RPC: el VRC (Volumen Reprogramado Comercial)
 * está en la Railway del dashboard Mercosur, fuera del Postgres de dpo-app.
 * Los componentes que sí son de Supabase salen de `sueno_otif_componentes`
 * (agregados en el server: traerlos crudos toparía las 1000 filas de PostgREST).
 *
 * Tolerante a fallos: si la Railway no responde, el VRC queda en null y se
 * informa `vrcDisponible: false` en vez de sumar cero silenciosamente — un cero
 * inventado bajaría el OTIF y se leería como una mejora que no pasó.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getPool } from "@/lib/mercosur-dashboard"

export interface OtifMes {
  mes: number
  bultosVendidos: number
  bultosRechazo: number
  bultosStockout: number
  bultosVrl: number
  bultosVrc: number | null
  /** (rechazo + stockout) ÷ vendidos × 100 */
  inFullPct: number | null
  /** In Full + (VRL + VRC) ÷ vendidos × 100 */
  otifPct: number | null
}

export interface OtifResumen {
  anio: number
  meses: OtifMes[]
  /** YTD ponderado: suma de bultos perdidos ÷ suma de bultos vendidos. */
  inFullYtd: number | null
  otifYtd: number | null
  /** false = la Railway no respondió; el OTIF queda sin el componente comercial. */
  vrcDisponible: boolean
}

interface ComponentesRow {
  mes: number
  bultos_vendidos: number | string | null
  bultos_rechazo: number | string | null
  bultos_stockout: number | string | null
  bultos_vrl: number | string | null
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** VRC en bultos por mes (1-12) del año. null = la Railway no respondió. */
async function fetchVrcBultosPorMes(
  anio: number,
): Promise<Map<number, number> | null> {
  try {
    const pool = getPool()
    const { rows } = await pool.query<{ mes: string; bultos: string | null }>(
      `select extract(month from fecha_entrega_original)::int::text as mes,
              sum(bultos) as bultos
         from vol_reprog_com_pedido
        where lower(region) = 'pampeana'
          and fecha_entrega_original is not null
          and extract(year from fecha_entrega_original) = $1
        group by 1`,
      [anio],
    )
    const out = new Map<number, number>()
    for (const r of rows) {
      const m = Number(r.mes)
      if (Number.isFinite(m)) out.set(m, num(r.bultos))
    }
    return out
  } catch {
    return null
  }
}

export async function otifResumen(
  supabase: SupabaseClient,
  anio: number,
): Promise<OtifResumen | null> {
  const { data, error } = await supabase.rpc("sueno_otif_componentes", {
    p_anio: anio,
  })
  if (error) return null

  const vrcPorMes = await fetchVrcBultosPorMes(anio)
  const vrcDisponible = vrcPorMes !== null

  const meses: OtifMes[] = ((data ?? []) as ComponentesRow[]).map((r) => {
    const bultosVendidos = num(r.bultos_vendidos)
    const bultosRechazo = num(r.bultos_rechazo)
    const bultosStockout = num(r.bultos_stockout)
    const bultosVrl = num(r.bultos_vrl)
    const bultosVrc = vrcPorMes?.get(r.mes) ?? (vrcDisponible ? 0 : null)

    // Sin ventas del mes no hay denominador: el mes queda vacío, no en cero.
    const inFullPct =
      bultosVendidos > 0
        ? ((bultosRechazo + bultosStockout) / bultosVendidos) * 100
        : null
    const otifPct =
      inFullPct !== null
        ? inFullPct + ((bultosVrl + (bultosVrc ?? 0)) / bultosVendidos) * 100
        : null

    return {
      mes: r.mes,
      bultosVendidos,
      bultosRechazo,
      bultosStockout,
      bultosVrl,
      bultosVrc,
      inFullPct: inFullPct === null ? null : redondear(inFullPct),
      otifPct: otifPct === null ? null : redondear(otifPct),
    }
  })

  // YTD ponderado por volumen (no promedio de los meses: cada mes pesa distinto).
  const vendidos = meses.reduce((s, m) => s + m.bultosVendidos, 0)
  const perdidaInFull = meses.reduce(
    (s, m) => s + m.bultosRechazo + m.bultosStockout,
    0,
  )
  const perdidaOtif = meses.reduce(
    (s, m) => s + m.bultosRechazo + m.bultosStockout + m.bultosVrl + (m.bultosVrc ?? 0),
    0,
  )

  return {
    anio,
    meses,
    inFullYtd: vendidos > 0 ? redondear((perdidaInFull / vendidos) * 100) : null,
    otifYtd: vendidos > 0 ? redondear((perdidaOtif / vendidos) * 100) : null,
    vrcDisponible,
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * OTIF e In-Full del Árbol del Sueño, con la definición del negocio:
 *
 *   In Full = (rechazos + stock out + cancelaciones) ÷ HL vendidos
 *   OTIF    = In Full + VRL + VRC                    (el On Time)
 *
 * Los dos se publican como % de PÉRDIDA (menos es mejor). NO se hace
 * "100 − resultado".
 *
 * 🚨 "HL vendidos" = facturado Chess NETO (la fila "vendidos" del Cuadro de
 * Indicadores), NO lo distribuido: deja afuera la venta mostrador, que es ~40%
 * del volumen, y el porcentaje sale casi al doble. El nodo `rechazo` sí va
 * sobre lo distribuido y por eso NO es comparable con estos dos.
 *
 * Todo va en HL: el mix de envases hace que el mismo mes dé distinto medido en
 * bultos (abril 2026: 3,84% en HL contra 3,22% en bultos, porque lo rechazado
 * ese mes fue producto de HL alto).
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
  hlVendidos: number
  hlRechazo: number
  hlStockout: number
  hlVrl: number
  hlVrc: number | null
  /** (rechazo + stockout) ÷ HL vendidos × 100 */
  inFullPct: number | null
  /** In Full + (VRL + VRC) ÷ vendidos × 100 */
  otifPct: number | null
}

export interface OtifResumen {
  anio: number
  meses: OtifMes[]
  /** YTD ponderado: suma de HL perdidos ÷ suma de HL vendidos. */
  inFullYtd: number | null
  otifYtd: number | null
  /** false = la Railway no respondió; el OTIF queda sin el componente comercial. */
  vrcDisponible: boolean
}

interface ComponentesRow {
  mes: number
  hl_vendidos: number | string | null
  hl_rechazo: number | string | null
  hl_stockout: number | string | null
  hl_vrl: number | string | null
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** VRC en HL por mes (1-12) del año. null = la Railway no respondió. */
async function fetchVrcHlPorMes(
  anio: number,
): Promise<Map<number, number> | null> {
  try {
    const pool = getPool()
    const { rows } = await pool.query<{ mes: string; hl: string | null }>(
      `select extract(month from fecha_entrega_original)::int::text as mes,
              sum(hl) as hl
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
      if (Number.isFinite(m)) out.set(m, num(r.hl))
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

  const vrcPorMes = await fetchVrcHlPorMes(anio)
  const vrcDisponible = vrcPorMes !== null

  const meses: OtifMes[] = ((data ?? []) as ComponentesRow[]).map((r) => {
    const hlVendidos = num(r.hl_vendidos)
    const hlRechazo = num(r.hl_rechazo)
    const hlStockout = num(r.hl_stockout)
    const hlVrl = num(r.hl_vrl)
    const hlVrc = vrcPorMes?.get(r.mes) ?? (vrcDisponible ? 0 : null)

    // Sin ventas del mes no hay denominador: el mes queda vacío, no en cero.
    const inFullPct =
      hlVendidos > 0
        ? ((hlRechazo + hlStockout) / hlVendidos) * 100
        : null
    const otifPct =
      inFullPct !== null
        ? inFullPct + ((hlVrl + (hlVrc ?? 0)) / hlVendidos) * 100
        : null

    return {
      mes: r.mes,
      hlVendidos,
      hlRechazo,
      hlStockout,
      hlVrl,
      hlVrc,
      inFullPct: inFullPct === null ? null : redondear(inFullPct),
      otifPct: otifPct === null ? null : redondear(otifPct),
    }
  })

  // YTD ponderado por volumen (no promedio de los meses: cada mes pesa distinto).
  const vendidos = meses.reduce((s, m) => s + m.hlVendidos, 0)
  const perdidaInFull = meses.reduce(
    (s, m) => s + m.hlRechazo + m.hlStockout,
    0,
  )
  const perdidaOtif = meses.reduce(
    (s, m) => s + m.hlRechazo + m.hlStockout + m.hlVrl + (m.hlVrc ?? 0),
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

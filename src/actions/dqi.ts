"use server"

import { requireAuth } from "@/lib/session"

// ===== DQI — Delivered Quality Index (Calidad de entrega, DPO Entrega 1.4) =====
// Roturas ocurridas EN LA ENTREGA/RUTA (categoría "ROTURA DISTRIBUCIÓN") ÷ HL
// entregados × 1.000.000 (PPM). El cálculo vive en el tablero deposito-esteban
// (que tiene la fuente de pérdidas); acá sólo lo consumimos para mostrarlo
// dentro de dpo-app, en /indicadores/dqi.

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"
const FETCH_TIMEOUT_MS = 15000

export interface DqiCard {
  mes: number | null
  anual_acum: number | null
  ly_mes: number | null
  ly_anual: number | null
  vs_ly_pct: number | null
  unidad: string
  serie_real: (number | null)[]
  serie_ly: (number | null)[]
}

export interface DqiTopSku {
  codigo: string
  descripcion: string
  hl: number
  valor: number
  unidades: number
}

export interface DqiDetalle {
  hl_mes: number
  valor_mes: number
  hl_total_roturas_mes: number
  pct_de_roturas: number | null
  top_skus: DqiTopSku[]
}

export interface DqiData {
  year: number
  month: number
  dqi: DqiCard
  detalle: DqiDetalle
}

export async function getDqi(
  year: number,
  month: number,
): Promise<{ data: DqiData } | { error: string }> {
  await requireAuth()
  try {
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores?year=${year}&month=${month}`,
      { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    )
    if (!res.ok) {
      return { error: `El tablero de pérdidas respondió ${res.status}` }
    }
    const j = (await res.json()) as {
      year: number
      month: number
      indicadores?: { dqi?: DqiCard }
      dqi_detalle?: DqiDetalle
    }
    const dqi = j?.indicadores?.dqi
    if (!dqi) {
      return { error: "El tablero no devolvió el indicador DQI todavía." }
    }
    return {
      data: {
        year: j.year,
        month: j.month,
        dqi,
        detalle:
          j.dqi_detalle ?? {
            hl_mes: 0,
            valor_mes: 0,
            hl_total_roturas_mes: 0,
            pct_de_roturas: null,
            top_skus: [],
          },
      },
    }
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `No se pudo consultar el tablero de pérdidas: ${e.message}`
          : "Error consultando el tablero de pérdidas.",
    }
  }
}

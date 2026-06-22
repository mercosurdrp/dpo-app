"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { createPlanAccion } from "@/actions/gestion"
import { getRoturasChofer } from "@/actions/roturas-calle"
import type { PrioridadPlan } from "@/types/database"
import type { RoturaConDetalle } from "@/types/roturas"

// ===== DQI — Delivered Quality Index (Calidad de entrega, DPO Entrega 1.4) =====
// Roturas ocurridas EN LA ENTREGA/RUTA (categoría "ROTURA DISTRIBUCIÓN") ÷ HL
// entregados × 1.000.000 (PPM). El cálculo vive en el tablero deposito-esteban
// (que tiene la fuente de pérdidas); acá sólo lo consumimos para mostrarlo
// dentro de dpo-app, en /indicadores/dqi.

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"
// El endpoint liviano /api/dqi tarda ~5s (no recalcula NAC/horas/WNP como el
// /api/indicadores pesado, que tarda ~22s). 30s de margen por cold starts.
const FETCH_TIMEOUT_MS = 30000

// Punto DPO Entrega 1.4 "Calidad de entrega de los productos".
const PREGUNTA_14_ID = "8d76cc3d-1d4e-4274-ac46-281cf22bdfd2"
const DQI_INDICADOR_NOMBRE = "DQI — Roturas en distribución"
// Marcador que guardamos en notas para asociar un plan a un mes del DQI.
const PERIODO_RE = /dqi_periodo=(\d{4})-(\d{2})/

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

export interface DqiPlan {
  id: string
  descripcion: string
  estado: string
  prioridad: string
  fecha_limite: string | null
  responsable: string | null
  /** Periodo "YYYY-MM" si el plan está asociado a un mes del DQI; null si es general. */
  periodo: string | null
  year: number | null
  month: number | null
}

export interface DqiData {
  year: number
  month: number
  dqi: DqiCard
  detalle: DqiDetalle
  /** Target en PPM tomado del indicador del punto 1.4 (meta). null si no está cargado. */
  target: number | null
  /** Planes de acción del punto 1.4 (todos los periodos). */
  planes: DqiPlan[]
  /** Roturas reportadas por choferes desde la app en el mes (registro, no recalcula el PPM). */
  roturas_chofer: RoturaConDetalle[]
}

export async function getDqi(
  year: number,
  month: number,
): Promise<{ data: DqiData } | { error: string }> {
  await requireAuth()
  try {
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/dqi?year=${year}&month=${month}`,
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

    // Target + planes del punto 1.4 (viven en dpo-app, no en el tablero) +
    // roturas reportadas por choferes desde la app (registro).
    const supabase = await createClient()
    const [{ data: ind }, { data: planesRaw }, roturasRes] = await Promise.all([
      supabase
        .from("indicadores")
        .select("meta")
        .eq("pregunta_id", PREGUNTA_14_ID)
        .eq("nombre", DQI_INDICADOR_NOMBRE)
        .maybeSingle(),
      supabase
        .from("planes_accion")
        .select("id, descripcion, estado, prioridad, notas, fecha_limite, responsable")
        .eq("pregunta_id", PREGUNTA_14_ID)
        .order("created_at", { ascending: false }),
      getRoturasChofer(year, month),
    ])
    const roturas_chofer = "data" in roturasRes ? roturasRes.data : []

    const target = ind?.meta && ind.meta > 0 ? Number(ind.meta) : null
    const planes: DqiPlan[] = (planesRaw ?? []).map((p) => {
      const m = (p.notas ?? "").match(PERIODO_RE)
      return {
        id: p.id as string,
        descripcion: p.descripcion as string,
        estado: p.estado as string,
        prioridad: p.prioridad as string,
        fecha_limite: (p.fecha_limite as string) ?? null,
        responsable: (p.responsable as string) ?? null,
        periodo: m ? `${m[1]}-${m[2]}` : null,
        year: m ? Number(m[1]) : null,
        month: m ? Number(m[2]) : null,
      }
    })

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
        target,
        planes,
        roturas_chofer,
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

/** Crea un plan de acción del punto 1.4 asociado a un mes concreto del DQI.
 * El mes queda codificado en notas (dqi_periodo=YYYY-MM) para poder marcarlo
 * sobre el gráfico de evolución. */
export async function crearPlanDqi(input: {
  year: number
  month: number
  descripcion: string
  responsable: string
  fecha_limite?: string
  prioridad?: PrioridadPlan
}): Promise<{ ok: true } | { error: string }> {
  await requireAuth()
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }
  if (!input.responsable.trim()) return { error: "El responsable es obligatorio." }
  const periodo = `${input.year}-${String(input.month).padStart(2, "0")}`
  const res = await createPlanAccion({
    pregunta_id: PREGUNTA_14_ID,
    descripcion: input.descripcion.trim(),
    responsable: input.responsable.trim(),
    fecha_limite: input.fecha_limite || undefined,
    prioridad: input.prioridad ?? "media",
    notas: `dqi_periodo=${periodo}`,
  })
  if ("error" in res) return { error: res.error }
  return { ok: true }
}

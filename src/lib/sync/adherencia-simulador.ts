import type { SupabaseClient } from "@supabase/supabase-js"
import type { Tendencia } from "@/types/database"

// Sync de Adherencia al Simulador de Dimensionamiento (solo Misiones).
// Consume el endpoint /api/adherencia del simulador (app standalone) y
// autocompleta 3 indicadores en el punto 2.3 del manual DPO ("Recurso del
// dimensionamiento", key 3_1_12_37): Dotación, Volumen HL y Horas Extra.
// Cada KPI guarda el último mes cerrado como `actual` (meta 100%), la
// tendencia vs el mes anterior y el historial mensual en `notas`.

const PREGUNTA_KEY_2_3 = "3_1_12_37"

const MESES_ABBR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]

type Campo = "dotacion" | "volumenHL" | "he"

const METRICAS: { nombre: string; campo: Campo; descripcion: string }[] = [
  {
    nombre: "Adherencia Dotación (simulador)",
    campo: "dotacion",
    descripcion: "Plantel real promedio ÷ dotación planificada × 100",
  },
  {
    nombre: "Adherencia Volumen HL (simulador)",
    campo: "volumenHL",
    descripcion: "HL real (Chess+GESCOM) ÷ HL plan × 100",
  },
  {
    nombre: "Adherencia HE (simulador)",
    campo: "he",
    descripcion: "Horas extra reales ÷ HE plan × 100",
  },
]

interface MesAdh {
  mes: number
  cargado: boolean
  tieneVentaChess: boolean
  dotacion: { plan: number; real: number; pct: number | null }
  volumenHL: { plan: number; real: number | null; pct: number | null }
  he: { plan: number; real: number; pct: number | null }
}

interface AdhResponse {
  site: string
  anio: number
  escenarioId: number
  escenarioNombre: string
  meses: MesAdh[]
}

export interface ResultadoSyncAdherencia {
  ok: boolean
  error?: string
  actualizados: number
  anio?: number
  escenario?: string
  detalle?: string[]
}

// Adherencia: meta = 100% (igualar el plan). "mejora" si el último mes quedó
// más cerca del 100 que el anterior; "deterioro" si se alejó. Mismo criterio
// de cercanía al plan que el semáforo del panel Plan vs Real del simulador.
function calcularTendencia(actual: number, prev: number | null): Tendencia {
  if (prev == null) return "neutral"
  const dActual = Math.abs(actual - 100)
  const dPrev = Math.abs(prev - 100)
  if (Math.abs(dActual - dPrev) < 0.5) return "estable"
  return dActual < dPrev ? "mejora" : "deterioro"
}

export async function syncAdherenciaSimulador(
  supabase: SupabaseClient,
  anio?: number,
): Promise<ResultadoSyncAdherencia> {
  const url = process.env.SIMULADOR_ADHERENCIA_URL
  const token = process.env.SIMULADOR_ADHERENCIA_TOKEN
  if (!url || !token) {
    return { ok: false, error: "SIMULADOR_ADHERENCIA_URL/TOKEN no configurados", actualizados: 0 }
  }

  const year = anio ?? new Date().getFullYear()

  let data: AdhResponse
  try {
    const res = await fetch(`${url}?anio=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!res.ok) {
      return { ok: false, error: `endpoint adherencia respondió ${res.status}`, actualizados: 0 }
    }
    data = (await res.json()) as AdhResponse
  } catch (e) {
    return { ok: false, error: `fetch adherencia falló: ${(e as Error).message}`, actualizados: 0 }
  }

  // Pregunta 2.3 del manual (key estable)
  const { data: preg } = await supabase
    .from("preguntas")
    .select("id")
    .eq("key", PREGUNTA_KEY_2_3)
    .maybeSingle()
  if (!preg) {
    return { ok: false, error: `pregunta 2.3 (${PREGUNTA_KEY_2_3}) no encontrada`, actualizados: 0 }
  }

  let actualizados = 0
  const detalle: string[] = []

  for (const m of METRICAS) {
    // Serie mensual de % para esta métrica, descartando meses sin dato.
    const serie = data.meses
      .map((mes) => ({ mes: mes.mes, pct: mes[m.campo].pct }))
      .filter((x): x is { mes: number; pct: number } => x.pct != null)

    if (serie.length === 0) {
      detalle.push(`${m.nombre}: sin dato`)
      continue
    }

    const ultimo = serie[serie.length - 1]
    const prev = serie.length >= 2 ? serie[serie.length - 2] : null
    const tend = calcularTendencia(ultimo.pct, prev?.pct ?? null)
    const historial = serie
      .slice()
      .reverse()
      .slice(0, 6)
      .map((x) => `${MESES_ABBR[x.mes - 1]} ${x.pct}%`)
      .join(" · ")
    const notas =
      `${m.descripcion}. Último mes cerrado: ${MESES_ABBR[ultimo.mes - 1]} ${year}. ` +
      `Escenario: ${data.escenarioNombre}. Historial: ${historial}. ` +
      `(Autocompletado desde el Simulador de Dimensionamiento)`

    const payload = {
      meta: 100,
      actual: ultimo.pct,
      unidad: "%",
      tendencia: tend,
      notas,
      updated_at: new Date().toISOString(),
    }

    const { data: ind } = await supabase
      .from("indicadores")
      .select("id")
      .eq("pregunta_id", preg.id)
      .eq("nombre", m.nombre)
      .maybeSingle()

    if (ind) {
      const { error } = await supabase.from("indicadores").update(payload).eq("id", ind.id)
      if (error) {
        detalle.push(`${m.nombre}: error update (${error.message})`)
        continue
      }
    } else {
      const { error } = await supabase
        .from("indicadores")
        .insert({ pregunta_id: preg.id, nombre: m.nombre, ...payload })
      if (error) {
        detalle.push(`${m.nombre}: error insert (${error.message})`)
        continue
      }
    }

    actualizados++
    detalle.push(`${m.nombre}: ${ultimo.pct}% (${tend})`)
  }

  return {
    ok: true,
    actualizados,
    anio: year,
    escenario: data.escenarioNombre,
    detalle,
  }
}

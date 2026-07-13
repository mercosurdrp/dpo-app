import type { createClient } from "@/lib/supabase/server"
import { foxtrotDcIds } from "@/lib/foxtrot"

// Tiempo promedio en ruta (Pampeana) — el KPI de Indicadores → Flota y el nodo
// "Tiempo en Ruta" del Árbol del Sueño.
//
// Sale de Foxtrot (`foxtrot_routes`), que mide la duración real de la ruta:
// `finalized_timestamp − started_timestamp`, ya persistida en `tiempo_ruta_minutos`.
//
// 🚨 Solo cuentan las RUTAS LIMPIAS: las que se cerraron el mismo día que
// arrancaron. Cuando el chofer no finaliza la ruta en la app, Foxtrot la cierra
// horas o días después y la duración deja de ser un tiempo de trabajo: tomando
// todas, enero da 11,8 hs promedio por ruta (¡casi 12!) contra 7,4 con las
// limpias. Es un descarte de dato sucio, no un recorte de la muestra: se descarta
// ~1 de cada 4 rutas y el promedio de las limpias reproduce el cierre de Andy
// (jun 6,60 exacto; el resto dentro de 15 min).
//
// El promedio es PONDERADO (Σ minutos ÷ Σ rutas): una salida pesa igual venga de
// donde venga, en vez de que una ciudad chica pese como una grande.

type Supabase = Awaited<ReturnType<typeof createClient>>

const PAGE = 1000

export interface TiempoRutaAcum {
  /** Horas promedio por ruta (ponderado). */
  horas: number
  rutas: number
}

export interface TiempoRutaLimpias {
  total: TiempoRutaAcum | null
  /** Serie mensual (1..12). */
  porMes: Map<number, TiempoRutaAcum>
  /** Rutas descartadas por no cerrarse en el día (o sin duración). */
  descartadas: number
}

interface RutaRow {
  fecha: string
  tiempo_ruta_minutos: number | null
  raw_data: {
    started_timestamp?: string | null
    finalized_timestamp?: string | null
  } | null
}

const dia = (t: string): string => new Date(t).toISOString().slice(0, 10)

/** ¿La ruta se cerró el mismo día que arrancó? */
export function esRutaLimpia(raw: RutaRow["raw_data"]): boolean {
  const inicio = raw?.started_timestamp
  const fin = raw?.finalized_timestamp
  if (!inicio || !fin) return false
  return dia(inicio) === dia(fin)
}

export async function tiempoRutaLimpias(
  supabase: Supabase,
  desde: string,
  hasta: string,
): Promise<TiempoRutaLimpias> {
  const rutas: RutaRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("foxtrot_routes")
      .select("fecha, tiempo_ruta_minutos, raw_data")
      .in("dc_id", foxtrotDcIds())
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as RutaRow[]
    rutas.push(...rows)
    if (rows.length < PAGE) break
  }

  type Acum = { min: number; rutas: number }
  const porMes = new Map<number, Acum>()
  const total: Acum = { min: 0, rutas: 0 }
  let descartadas = 0

  for (const r of rutas) {
    const min = r.tiempo_ruta_minutos
    if (!min || min <= 0 || !esRutaLimpia(r.raw_data)) {
      descartadas++
      continue
    }
    const mes = Number(r.fecha.slice(5, 7))
    const m = porMes.get(mes) ?? { min: 0, rutas: 0 }
    for (const a of [m, total]) {
      a.min += min
      a.rutas += 1
    }
    porMes.set(mes, m)
  }

  const cerrar = (a: Acum): TiempoRutaAcum => ({
    horas: Math.round((a.min / a.rutas / 60) * 100) / 100,
    rutas: a.rutas,
  })

  const meses = new Map<number, TiempoRutaAcum>()
  for (const [mes, a] of [...porMes].sort((x, y) => x[0] - y[0])) {
    if (a.rutas > 0) meses.set(mes, cerrar(a))
  }

  return {
    total: total.rutas > 0 ? cerrar(total) : null,
    porMes: meses,
    descartadas,
  }
}

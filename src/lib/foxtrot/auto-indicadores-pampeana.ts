/**
 * Indicadores AUTO de Foxtrot para la Matinal de Distribución de Pampeana.
 *
 * A diferencia de Misiones (auto-indicadores-misiones.ts, que mezcla Foxtrot +
 * Chess + Analía y resuelve carga/HL/OB), acá solo agregamos las métricas de
 * EJECUCIÓN y CALIDAD DE CONDUCCIÓN que Foxtrot reporta por ruta y que hasta
 * ahora no se mostraban en ningún lado:
 *
 *   Calidad de conducción (CSV ROUTE_ANALYTICS, persistido por foxtrot-analytics):
 *     - Driver Click Score        → foxtrot_routes.driver_click_score (0-100)
 *     - Adherencia a la secuencia  → foxtrot_routes.adherencia_secuencia (0-100)
 *     - % rutas con resecuenciado  → raw_data.fx_seq_enabled
 *   Operativos de ruta:
 *     - Tiempo de ruta, % rutas finalizadas, % entregas exitosas
 *     - Km recorridos / planificados (raw_data.fx_driven_m / fx_planned_m)
 *     - Tiempo por PDV (raw_data.tml_authorized_stops_seconds / tml_visited_customers)
 *     - Paradas no autorizadas (raw_data.fx_unauth_stops_count)
 *
 * Todo se lee de la tabla `foxtrot_routes` (días ya sincronizados). La matinal
 * mira días cerrados, así que no hace falta el camino "en vivo" de Misiones.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { foxtrotDcIds } from "@/lib/foxtrot"

const PAGE_SIZE = 1000

const round1 = (n: number) => Math.round(n * 10) / 10

export interface PampeanaFoxtrotSerie {
  /** Driver Click Score promedio del día (0-100). */
  click_score: Record<string, number | null>
  /** Adherencia a la secuencia promedio del día (0-100). */
  adherencia_secuencia: Record<string, number | null>
  /** % de rutas del día con resecuenciado en tiempo real activado. */
  pct_resecuenciado: Record<string, number | null>
  /** Tiempo de ruta promedio (min), solo rutas finalizadas. */
  tiempo_ruta: Record<string, number | null>
  /** % de rutas finalizadas. */
  pct_finalizadas: Record<string, number | null>
  /** % de entregas exitosas (clientes), solo rutas finalizadas. */
  pct_entregas_exitosas: Record<string, number | null>
  /** Km recorridos (suma del día). */
  km_recorridos: Record<string, number | null>
  /** Km planificados por Foxtrot (suma del día). */
  km_planificados: Record<string, number | null>
  /** Tiempo por PDV promedio (min) entre rutas del día. */
  tiempo_pdv: Record<string, number | null>
  /** Paradas no autorizadas (suma del día). */
  paradas_no_autorizadas: Record<string, number | null>
}

type RouteRow = {
  fecha: string
  is_finalized: boolean | null
  tiempo_ruta_minutos: number | null
  total_deliveries: number | null
  deliveries_successful: number | null
  driver_click_score: number | null
  adherencia_secuencia: number | null
  raw_data: {
    fx_seq_enabled?: boolean | null
    fx_driven_m?: number | null
    fx_planned_m?: number | null
    fx_unauth_stops_count?: number | null
    tml_authorized_stops_seconds?: number | null
    tml_visited_customers?: number | null
  } | null
}

type Acc = {
  // promedios: suma + n
  clickSum: number; clickN: number
  adhSum: number; adhN: number
  seqEnabled: number; seqTotal: number
  tiempoSum: number; tiempoN: number
  finalizadas: number; rutas: number
  delSuccess: number; delTotal: number
  drivenM: number; plannedM: number
  pdvSum: number; pdvN: number
  unauth: number
}

function emptyAcc(): Acc {
  return {
    clickSum: 0, clickN: 0,
    adhSum: 0, adhN: 0,
    seqEnabled: 0, seqTotal: 0,
    tiempoSum: 0, tiempoN: 0,
    finalizadas: 0, rutas: 0,
    delSuccess: 0, delTotal: 0,
    drivenM: 0, plannedM: 0,
    pdvSum: 0, pdvN: 0,
    unauth: 0,
  }
}

export async function buildPampeanaFoxtrotSerie(
  supabase: SupabaseClient,
  fechas: string[],
): Promise<PampeanaFoxtrotSerie> {
  const fechaDesde = fechas[0]
  const fechaHasta = fechas[fechas.length - 1]
  const dcs = foxtrotDcIds()

  const serie: PampeanaFoxtrotSerie = {
    click_score: {},
    adherencia_secuencia: {},
    pct_resecuenciado: {},
    tiempo_ruta: {},
    pct_finalizadas: {},
    pct_entregas_exitosas: {},
    km_recorridos: {},
    km_planificados: {},
    tiempo_pdv: {},
    paradas_no_autorizadas: {},
  }
  for (const f of fechas) {
    for (const k of Object.keys(serie) as (keyof PampeanaFoxtrotSerie)[]) {
      serie[k][f] = null
    }
  }

  const rows: RouteRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("foxtrot_routes")
      .select(
        "fecha, is_finalized, tiempo_ruta_minutos, total_deliveries, deliveries_successful, driver_click_score, adherencia_secuencia, raw_data",
      )
      .in("dc_id", dcs)
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .range(from, from + PAGE_SIZE - 1)
    if (error || !data || data.length === 0) break
    rows.push(...(data as RouteRow[]))
    if (data.length < PAGE_SIZE) break
  }

  const porFecha = new Map<string, Acc>()
  for (const r of rows) {
    const a = porFecha.get(r.fecha) ?? emptyAcc()
    a.rutas++
    const finalizada = r.is_finalized === true
    if (finalizada) a.finalizadas++

    if (r.driver_click_score != null && Number.isFinite(r.driver_click_score)) {
      a.clickSum += r.driver_click_score
      a.clickN++
    }
    if (r.adherencia_secuencia != null && Number.isFinite(r.adherencia_secuencia)) {
      a.adhSum += r.adherencia_secuencia
      a.adhN++
    }
    const rd = r.raw_data ?? {}
    if (typeof rd.fx_seq_enabled === "boolean") {
      a.seqTotal++
      if (rd.fx_seq_enabled) a.seqEnabled++
    }
    if (finalizada && r.tiempo_ruta_minutos != null && r.tiempo_ruta_minutos > 0) {
      a.tiempoSum += r.tiempo_ruta_minutos
      a.tiempoN++
    }
    if (finalizada) {
      a.delTotal += r.total_deliveries ?? 0
      a.delSuccess += r.deliveries_successful ?? 0
    }
    if (rd.fx_driven_m != null && Number.isFinite(rd.fx_driven_m)) a.drivenM += rd.fx_driven_m
    if (rd.fx_planned_m != null && Number.isFinite(rd.fx_planned_m)) a.plannedM += rd.fx_planned_m
    if (rd.fx_unauth_stops_count != null && Number.isFinite(rd.fx_unauth_stops_count)) {
      a.unauth += rd.fx_unauth_stops_count
    }
    const authSec = rd.tml_authorized_stops_seconds
    const visited = rd.tml_visited_customers
    if (authSec != null && visited != null && visited > 0) {
      a.pdvSum += authSec / visited / 60
      a.pdvN++
    }
    porFecha.set(r.fecha, a)
  }

  for (const [f, a] of porFecha) {
    if (a.clickN > 0) serie.click_score[f] = round1(a.clickSum / a.clickN)
    if (a.adhN > 0) serie.adherencia_secuencia[f] = round1(a.adhSum / a.adhN)
    if (a.seqTotal > 0) serie.pct_resecuenciado[f] = round1((100 * a.seqEnabled) / a.seqTotal)
    if (a.tiempoN > 0) serie.tiempo_ruta[f] = Math.round(a.tiempoSum / a.tiempoN)
    if (a.rutas > 0) serie.pct_finalizadas[f] = round1((100 * a.finalizadas) / a.rutas)
    if (a.delTotal > 0) serie.pct_entregas_exitosas[f] = round1((100 * a.delSuccess) / a.delTotal)
    if (a.drivenM > 0) serie.km_recorridos[f] = round1(a.drivenM / 1000)
    if (a.plannedM > 0) serie.km_planificados[f] = round1(a.plannedM / 1000)
    if (a.pdvN > 0) serie.tiempo_pdv[f] = round1(a.pdvSum / a.pdvN)
    serie.paradas_no_autorizadas[f] = Math.round(a.unauth)
  }

  return serie
}

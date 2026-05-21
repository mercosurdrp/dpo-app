/**
 * Indicadores AUTO para reuniones de tipo 'logistica' en Misiones.
 *
 * Reemplaza el path warehouse/Pampeana (deposito-esteban) que no aplica acá:
 * Misiones no tiene esos endpoints ni mostraría datos correctos.
 *
 * Fuentes:
 *   - foxtrot_routes (Supabase) → KPIs agregados de ruta (tiempo, finalización,
 *     visitas) cerrados por el cron `/api/foxtrot/cron-sync` (20:30 AR).
 *   - foxtrot_delivery_attempts (Supabase) → bultos salida a reparto y %
 *     rechazo siguiendo la misma lógica de `/indicadores/foxtrot-tracking`
 *     (último attempt FAILED sin SUCCESSFUL previo = rechazado).
 *   - listDcs + findRoutesByDate (live) → rutas en distribución HOY.
 *   - getTmlFoxtrotRango → TML híbrido (live para hoy, DB para previos).
 *
 * Ausentismo lo agrega el caller con getAusentismoSerie (mismo que Pampeana).
 *
 * Fase 2: integrar dashboard de Analía (perdidas-deposito.vercel.app) para
 * Carga/Descarga, Reempaque, Pérdidas, 5S, y Cloudfleet para checklists
 * pre-uso del día.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { findRoutesByDate, listDcs } from "@/lib/foxtrot"
import { getTmlFoxtrotRango } from "@/actions/tml-foxtrot"

export type MisionesSucursal = "todo" | "eldorado" | "iguazu"

export interface MisionesLogisticaSerie {
  /** Cantidad de rutas con inicio disparado (DB para días pasados; live para hoy). */
  rutas_distribucion: Record<string, number | null>
  /** Bultos cargados al camión = SUM(delivery_quantity) único por delivery_id. */
  bultos_salida_reparto: Record<string, number | null>
  /** % rechazo en bultos: bultos_rech / (bultos_ok + bultos_rech) × 100. */
  pct_rechazo: Record<string, number | null>
  /** AVG(tiempo_ruta_minutos) sobre rutas con tiempo válido. */
  tiempo_ruta_promedio: Record<string, number | null>
  /** % rutas con is_finalized=true. */
  pct_rutas_finalizadas: Record<string, number | null>
  /** SUM(deliveries_successful) / SUM(total_deliveries) × 100 (en clientes). */
  pct_entregas_exitosas: Record<string, number | null>
  /** TML promedio del día en minutos (de getTmlFoxtrotRango). */
  tml_promedio: Record<string, number | null>
  /** % equipos con TML ≤ 30 min. */
  tml_pct_en_meta: Record<string, number | null>
}

type RouteRow = {
  fecha: string
  is_finalized: boolean | null
  tiempo_ruta_minutos: number | null
  total_deliveries: number | null
  deliveries_successful: number | null
}

type AttemptRow = {
  fecha: string
  delivery_id: string
  delivery_quantity: number | null
  attempt_status: string
  attempt_timestamp: string | null
}

type RouteAgg = {
  rutas: number
  finalizadas: number
  tiempoSum: number
  tiempoN: number
  totalDel: number
  successDel: number
}

type BultoAgg = {
  bultosTotal: number
  bultosOk: number
  bultosRech: number
}

const MISIONES_DCS = new Set(["eldorado", "iguazu"])
const PAGE_SIZE = 1000

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function todayARG(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

async function fetchAttemptsRange(
  supabase: SupabaseClient,
  fechaDesde: string,
  fechaHasta: string,
  routeIdsFilter: string[] | null,
): Promise<AttemptRow[]> {
  // Si hay filtro de sucursal, ya nos vino la lista de route_ids del DC.
  // Si la lista está vacía → no hay nada que traer.
  if (routeIdsFilter !== null && routeIdsFilter.length === 0) return []

  const all: AttemptRow[] = []
  let from = 0
  // Loop con tope de seguridad (~200k filas — un mes de Misiones cabe holgado).
  for (let i = 0; i < 200; i++) {
    let q = supabase
      .from("foxtrot_delivery_attempts")
      .select("fecha, delivery_id, delivery_quantity, attempt_status, attempt_timestamp")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("attempt_timestamp", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (routeIdsFilter !== null) {
      q = q.in("route_id", routeIdsFilter)
    }
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    all.push(...(data as AttemptRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

async function fetchRouteIdsForDcs(
  supabase: SupabaseClient,
  fechaDesde: string,
  fechaHasta: string,
  dcs: string[],
): Promise<string[]> {
  const all: string[] = []
  let from = 0
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabase
      .from("foxtrot_routes")
      .select("route_id")
      .in("dc_id", dcs)
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .range(from, from + PAGE_SIZE - 1)
    if (error || !data || data.length === 0) break
    for (const r of data as { route_id: string }[]) all.push(r.route_id)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

/**
 * Para cada (fecha, delivery_id) consolida los attempts en una sola entrada:
 *   - último attempt = SUCCESSFUL  → bultos_ok += qty
 *   - último attempt = FAILED con SUCCESSFUL previo (parcial) → bultos_ok += qty
 *   - último attempt = FAILED sin SUCCESSFUL previo → bultos_rech += qty
 *   - bultos_total siempre += qty (todo lo planificado = salida a reparto)
 *
 * Esta es la misma lógica de foxtrot-snapshot/build.ts (la grilla de
 * /indicadores/foxtrot-tracking), portada a SQL+TS sin necesidad de
 * rehacer todo el snapshot.
 */
function aggregateBultos(attempts: AttemptRow[]): Map<string, BultoAgg> {
  // Agrupar por (fecha, delivery_id) — los attempts ya vienen ordenados por timestamp.
  type Group = { qty: number; statuses: string[] }
  const groups = new Map<string, Group>()
  for (const a of attempts) {
    if (!a.delivery_id) continue
    const key = `${a.fecha}|${a.delivery_id}`
    const g = groups.get(key) ?? {
      qty: a.delivery_quantity ?? 0,
      statuses: [],
    }
    // qty siempre es la misma para un delivery_id, pero por las dudas
    // tomamos el primero no-null.
    if (g.qty === 0 && a.delivery_quantity) g.qty = a.delivery_quantity
    g.statuses.push(a.attempt_status)
    groups.set(key, g)
  }

  const porFecha = new Map<string, BultoAgg>()
  for (const [key, g] of groups) {
    const fecha = key.split("|")[0]
    const agg = porFecha.get(fecha) ?? {
      bultosTotal: 0,
      bultosOk: 0,
      bultosRech: 0,
    }
    agg.bultosTotal += g.qty
    const last = g.statuses[g.statuses.length - 1]
    if (last === "SUCCESSFUL") {
      agg.bultosOk += g.qty
    } else if (last === "FAILED") {
      const hadSuccessful = g.statuses.some((s) => s === "SUCCESSFUL")
      if (hadSuccessful) agg.bultosOk += g.qty
      else agg.bultosRech += g.qty
    }
    // VISIT_LATER o estados desconocidos: cuentan solo en bultosTotal.
    porFecha.set(fecha, agg)
  }
  return porFecha
}

export async function buildMisionesLogisticaSerie(
  supabase: SupabaseClient,
  fechas: string[],
  _fechaReunion: string,
  sucursal: MisionesSucursal = "todo",
): Promise<MisionesLogisticaSerie> {
  const fechaDesde = fechas[0]
  const fechaHasta = fechas[fechas.length - 1]
  const hoy = todayARG()
  const dcsActivos: string[] =
    sucursal === "todo"
      ? ["eldorado", "iguazu"]
      : sucursal === "eldorado"
        ? ["eldorado"]
        : ["iguazu"]

  const series: MisionesLogisticaSerie = {
    rutas_distribucion: {},
    bultos_salida_reparto: {},
    pct_rechazo: {},
    tiempo_ruta_promedio: {},
    pct_rutas_finalizadas: {},
    pct_entregas_exitosas: {},
    tml_promedio: {},
    tml_pct_en_meta: {},
  }
  for (const f of fechas) {
    series.rutas_distribucion[f] = null
    series.bultos_salida_reparto[f] = null
    series.pct_rechazo[f] = null
    series.tiempo_ruta_promedio[f] = null
    series.pct_rutas_finalizadas[f] = null
    series.pct_entregas_exitosas[f] = null
    series.tml_promedio[f] = null
    series.tml_pct_en_meta[f] = null
  }

  // 1. KPIs de ruta — foxtrot_routes (filtrado por DC).
  const { data: routesRaw } = await supabase
    .from("foxtrot_routes")
    .select(
      "fecha, is_finalized, tiempo_ruta_minutos, total_deliveries, deliveries_successful",
    )
    .in("dc_id", dcsActivos)
    .gte("fecha", fechaDesde)
    .lte("fecha", fechaHasta)

  const porFechaRoute = new Map<string, RouteAgg>()
  for (const r of (routesRaw ?? []) as RouteRow[]) {
    const a = porFechaRoute.get(r.fecha) ?? {
      rutas: 0,
      finalizadas: 0,
      tiempoSum: 0,
      tiempoN: 0,
      totalDel: 0,
      successDel: 0,
    }
    a.rutas++
    if (r.is_finalized) a.finalizadas++
    if (r.tiempo_ruta_minutos != null && r.tiempo_ruta_minutos > 0) {
      a.tiempoSum += r.tiempo_ruta_minutos
      a.tiempoN++
    }
    a.totalDel += r.total_deliveries ?? 0
    a.successDel += r.deliveries_successful ?? 0
    porFechaRoute.set(r.fecha, a)
  }

  for (const [f, a] of porFechaRoute) {
    series.rutas_distribucion[f] = a.rutas
    if (a.rutas > 0) {
      series.pct_rutas_finalizadas[f] = round1((100 * a.finalizadas) / a.rutas)
    }
    if (a.tiempoN > 0) {
      series.tiempo_ruta_promedio[f] = Math.round(a.tiempoSum / a.tiempoN)
    }
    if (a.totalDel > 0) {
      series.pct_entregas_exitosas[f] = round1(
        (100 * a.successDel) / a.totalDel,
      )
    }
  }

  // 2. Bultos + % rechazo — foxtrot_delivery_attempts (paginado).
  //    Lógica idéntica a /indicadores/foxtrot-tracking (foxtrot-snapshot/build.ts).
  //    Si hay filtro de sucursal, traemos primero los route_ids del DC y
  //    filtramos attempts por esa lista (la tabla no tiene dc_id propio).
  const routeIdsFilter: string[] | null =
    sucursal === "todo"
      ? null
      : await fetchRouteIdsForDcs(supabase, fechaDesde, fechaHasta, dcsActivos)
  const attempts = await fetchAttemptsRange(
    supabase,
    fechaDesde,
    fechaHasta,
    routeIdsFilter,
  )
  const porFechaBultos = aggregateBultos(attempts)
  for (const [f, b] of porFechaBultos) {
    series.bultos_salida_reparto[f] = b.bultosTotal
    const denom = b.bultosOk + b.bultosRech
    if (denom > 0) {
      series.pct_rechazo[f] = round2((100 * b.bultosRech) / denom)
    }
  }

  // 3. Rutas en distribución HOY (live). Cuenta rutas con started_timestamp.
  if (fechas.includes(hoy)) {
    try {
      const dcsRes = await listDcs()
      if ("data" in dcsRes) {
        let activasHoy = 0
        const dcs = dcsRes.data
          .filter((d) => MISIONES_DCS.has(d.id))
          .filter((d) => dcsActivos.includes(d.id))
        for (const dc of dcs) {
          const rRes = await findRoutesByDate(dc.id, hoy)
          if ("data" in rRes) {
            activasHoy += rRes.data.filter(
              (r) => r.started_timestamp != null,
            ).length
          }
        }
        series.rutas_distribucion[hoy] = activasHoy
      }
    } catch {
      // dejar el valor de DB
    }
  }

  // 4. TML — getTmlFoxtrotRango ya hace híbrido (live hoy + DB previos)
  //    y expone serie_diaria con desglose por sucursal.
  try {
    const tmlRes = await getTmlFoxtrotRango(
      fechaDesde,
      fechaHasta,
      "personalizado",
    )
    if ("data" in tmlRes) {
      for (const dia of tmlRes.data.serie_diaria) {
        const t =
          sucursal === "eldorado"
            ? dia.eldorado
            : sucursal === "iguazu"
              ? dia.iguazu
              : dia.total
        if (t.promedio_real_min != null) {
          series.tml_promedio[dia.fecha] = Math.round(t.promedio_real_min)
        }
        if (t.equipos_con_tml > 0) {
          series.tml_pct_en_meta[dia.fecha] = round1(
            (100 * t.en_meta_real) / t.equipos_con_tml,
          )
        }
      }
    }
  } catch {
    // si TML falla, esas columnas quedan en null
  }

  return series
}

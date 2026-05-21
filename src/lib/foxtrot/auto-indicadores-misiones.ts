/**
 * Indicadores AUTO para reuniones de tipo 'logistica' en Misiones.
 *
 * Reemplaza el path warehouse/Pampeana (deposito-esteban) que no aplica acá.
 *
 * Fuentes:
 *   - foxtrot_routes (Supabase) → KPIs de ruta (tiempo, finalización, horas).
 *   - foxtrot_delivery_attempts (Supabase) → bultos, % rechazo, y el desglose
 *     por ruta para CEq/HL.
 *   - articulos-factores (Chess, cacheado) → bultos/pallet y HL por bulto para
 *     cajas equivalentes (CEq) y hectolitros.
 *   - listDcs + findRoutesByDate (live) → rutas en distribución HOY.
 *   - getTmlFoxtrotRango → TML híbrido.
 *
 * Definiciones (validadas con el usuario):
 *   CEq_SKU = 120 × bultos / bultosPallet           (caja patrón = 120 por pallet)
 *   HL      = Σ valorUM × bultos                     (salida a reparto, sin envases)
 *   OB      = promedio por ruta de las CEq cargadas  (ocupación de bodega)
 *   TLP     = promedio por ruta de CEq_entregadas/(2×horas_ruta)
 * Todo excluyendo envases retornables.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { findRoutesByDate, listDcs } from "@/lib/foxtrot"
import { getTmlFoxtrotRango } from "@/actions/tml-foxtrot"
import {
  getArticulosFactores,
  normNombre,
  type FactoresMap,
} from "@/lib/chess/articulos-factores"

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
  /** Hectolitros salidos a reparto (sin envases). */
  hl: Record<string, number | null>
  /** Ocupación de bodega = promedio por ruta de las CEq cargadas. */
  ob: Record<string, number | null>
  /** TLP = promedio por ruta de CEq_entregadas / (2 × horas_ruta). */
  tlp: Record<string, number | null>
  /** Tiempo por PDV en minutos = promedio por ruta del tiempo de servicio por visita. */
  tiempo_pdv: Record<string, number | null>
}

type RouteRow = {
  route_id: string
  fecha: string
  is_finalized: boolean | null
  tiempo_ruta_minutos: number | null
  total_deliveries: number | null
  deliveries_successful: number | null
  raw_data: {
    tml_authorized_stops_seconds?: number | null
    tml_visited_customers?: number | null
  } | null
}

type AttemptRow = {
  fecha: string
  route_id: string
  delivery_id: string
  delivery_name: string | null
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

const MISIONES_DCS = new Set(["eldorado", "iguazu"])
const PAGE_SIZE = 1000
const CAJA_PATRON = 120

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
  if (routeIdsFilter !== null && routeIdsFilter.length === 0) return []
  const all: AttemptRow[] = []
  let from = 0
  for (let i = 0; i < 200; i++) {
    let q = supabase
      .from("foxtrot_delivery_attempts")
      .select(
        "fecha, route_id, delivery_id, delivery_name, delivery_quantity, attempt_status, attempt_timestamp",
      )
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("attempt_timestamp", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (routeIdsFilter !== null) q = q.in("route_id", routeIdsFilter)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    all.push(...(data as AttemptRow[]))
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
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
    hl: {},
    ob: {},
    tlp: {},
    tiempo_pdv: {},
  }
  for (const f of fechas) {
    for (const k of Object.keys(series) as (keyof MisionesLogisticaSerie)[]) {
      series[k][f] = null
    }
  }

  // 1. KPIs de ruta + horas por ruta — foxtrot_routes (filtrado por DC).
  const { data: routesRaw } = await supabase
    .from("foxtrot_routes")
    .select(
      "route_id, fecha, is_finalized, tiempo_ruta_minutos, total_deliveries, deliveries_successful, raw_data",
    )
    .in("dc_id", dcsActivos)
    .gte("fecha", fechaDesde)
    .lte("fecha", fechaHasta)

  const horasPorRuta = new Map<string, number>() // route_id → horas
  const fechaPorRuta = new Map<string, string>()
  const porFechaRoute = new Map<string, RouteAgg>()
  // Tiempo por PDV (desde ROUTE_ANALYTICS): seg de paradas autorizadas /
  // clientes visitados, por ruta; el día = promedio entre rutas.
  const pdvPorFecha = new Map<string, { sumMin: number; nRutas: number }>()
  for (const r of (routesRaw ?? []) as RouteRow[]) {
    fechaPorRuta.set(r.route_id, r.fecha)
    if (r.tiempo_ruta_minutos != null && r.tiempo_ruta_minutos > 0) {
      horasPorRuta.set(r.route_id, r.tiempo_ruta_minutos / 60)
    }
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

    const authSec = r.raw_data?.tml_authorized_stops_seconds
    const visited = r.raw_data?.tml_visited_customers
    if (authSec != null && visited != null && visited > 0) {
      const minPorPdv = authSec / visited / 60
      const acc = pdvPorFecha.get(r.fecha) ?? { sumMin: 0, nRutas: 0 }
      acc.sumMin += minPorPdv
      acc.nRutas++
      pdvPorFecha.set(r.fecha, acc)
    }
  }
  for (const [f, acc] of pdvPorFecha) {
    if (acc.nRutas > 0) series.tiempo_pdv[f] = round1(acc.sumMin / acc.nRutas)
  }
  for (const [f, a] of porFechaRoute) {
    series.rutas_distribucion[f] = a.rutas
    if (a.rutas > 0)
      series.pct_rutas_finalizadas[f] = round1((100 * a.finalizadas) / a.rutas)
    if (a.tiempoN > 0)
      series.tiempo_ruta_promedio[f] = Math.round(a.tiempoSum / a.tiempoN)
    if (a.totalDel > 0)
      series.pct_entregas_exitosas[f] = round1((100 * a.successDel) / a.totalDel)
  }

  // 2. Attempts: bultos/rechazo (por fecha) + CEq/HL (por ruta) cruzando Chess.
  const routeIdsFilter: string[] | null =
    sucursal === "todo"
      ? null
      : Array.from(fechaPorRuta.keys())
  const attempts = await fetchAttemptsRange(
    supabase,
    fechaDesde,
    fechaHasta,
    routeIdsFilter,
  )
  const factores: FactoresMap | null = await getArticulosFactores()

  // Consolidar por (fecha, route_id, delivery_id): un delivery pertenece a una
  // ruta; los attempts vienen ordenados por timestamp para tomar el último.
  type DelAgg = {
    fecha: string
    routeId: string
    qty: number
    nm: string
    statuses: string[]
  }
  const dels = new Map<string, DelAgg>()
  for (const a of attempts) {
    if (!a.delivery_id) continue
    const key = `${a.fecha}|${a.route_id}|${a.delivery_id}`
    const g =
      dels.get(key) ??
      ({
        fecha: a.fecha,
        routeId: a.route_id,
        qty: a.delivery_quantity ?? 0,
        nm: normNombre(a.delivery_name),
        statuses: [],
      } as DelAgg)
    if (g.qty === 0 && a.delivery_quantity) g.qty = a.delivery_quantity
    g.statuses.push(a.attempt_status)
    dels.set(key, g)
  }

  // Acumuladores
  const bultosPorFecha = new Map<
    string,
    { total: number; ok: number; rech: number }
  >()
  const hlPorFecha = new Map<string, number>()
  // CEq por ruta: route_id → { cargada, entregada }
  const ceqPorRuta = new Map<string, { cargada: number; entregada: number }>()

  for (const g of dels.values()) {
    const last = g.statuses[g.statuses.length - 1]
    const entregado =
      last === "SUCCESSFUL" ||
      (last === "FAILED" && g.statuses.includes("SUCCESSFUL"))

    // Bultos / rechazo por fecha (no dependen de Chess)
    const bf = bultosPorFecha.get(g.fecha) ?? { total: 0, ok: 0, rech: 0 }
    bf.total += g.qty
    if (last === "SUCCESSFUL") bf.ok += g.qty
    else if (last === "FAILED") {
      if (g.statuses.includes("SUCCESSFUL")) bf.ok += g.qty
      else bf.rech += g.qty
    }
    bultosPorFecha.set(g.fecha, bf)

    // CEq / HL: requieren el factor del SKU; se excluyen envases.
    const fac = factores?.get(g.nm)
    if (!fac || fac.esEnvase) continue
    if (fac.valorUM > 0) {
      hlPorFecha.set(g.fecha, (hlPorFecha.get(g.fecha) ?? 0) + fac.valorUM * g.qty)
    }
    if (fac.bultosPallet > 0) {
      const ceq = (CAJA_PATRON * g.qty) / fac.bultosPallet
      const c = ceqPorRuta.get(g.routeId) ?? { cargada: 0, entregada: 0 }
      c.cargada += ceq
      if (entregado) c.entregada += ceq
      ceqPorRuta.set(g.routeId, c)
    }
  }

  for (const [f, b] of bultosPorFecha) {
    series.bultos_salida_reparto[f] = Math.round(b.total)
    const denom = b.ok + b.rech
    if (denom > 0) series.pct_rechazo[f] = round2((100 * b.rech) / denom)
  }
  for (const [f, hl] of hlPorFecha) series.hl[f] = Math.round(hl)

  // OB y TLP: agregar las CEq por ruta a su fecha.
  type ObTlp = { ceqCargadaSum: number; nRutas: number; tlpSum: number; tlpN: number }
  const obtlp = new Map<string, ObTlp>()
  for (const [routeId, c] of ceqPorRuta) {
    const f = fechaPorRuta.get(routeId)
    if (!f) continue
    const o = obtlp.get(f) ?? { ceqCargadaSum: 0, nRutas: 0, tlpSum: 0, tlpN: 0 }
    o.ceqCargadaSum += c.cargada
    o.nRutas++
    const horas = horasPorRuta.get(routeId)
    if (horas && horas > 0) {
      o.tlpSum += c.entregada / (2 * horas)
      o.tlpN++
    }
    obtlp.set(f, o)
  }
  for (const [f, o] of obtlp) {
    if (o.nRutas > 0) series.ob[f] = Math.round(o.ceqCargadaSum / o.nRutas)
    if (o.tlpN > 0) series.tlp[f] = round2(o.tlpSum / o.tlpN)
  }

  // 3. Rutas en distribución HOY (live).
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

  // 4. TML — getTmlFoxtrotRango (híbrido) con desglose por sucursal.
  try {
    const tmlRes = await getTmlFoxtrotRango(fechaDesde, fechaHasta, "personalizado")
    if ("data" in tmlRes) {
      for (const dia of tmlRes.data.serie_diaria) {
        const t =
          sucursal === "eldorado"
            ? dia.eldorado
            : sucursal === "iguazu"
              ? dia.iguazu
              : dia.total
        if (t.promedio_real_min != null)
          series.tml_promedio[dia.fecha] = Math.round(t.promedio_real_min)
        if (t.equipos_con_tml > 0)
          series.tml_pct_en_meta[dia.fecha] = round1(
            (100 * t.en_meta_real) / t.equipos_con_tml,
          )
      }
    }
  } catch {
    // si TML falla, esas columnas quedan en null
  }

  return series
}

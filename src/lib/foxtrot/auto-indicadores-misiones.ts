/**
 * Indicadores AUTO para reuniones de tipo 'logistica' en Misiones.
 *
 * Reemplaza el path warehouse/Pampeana (deposito-esteban) que no aplica acá.
 *
 * Fuentes:
 *   - foxtrot_routes (Supabase) → KPIs de ruta (tiempo, finalización, horas);
 *     tiempo/entregas SOLO de rutas finalizadas (las en curso traen ETA estimado).
 *   - foxtrot_route_deliveries (Supabase) → MANIFIESTO de carga (lo que salió a
 *     la calle) → bultos, HL, OB. Días cerrados desde DB; HOY en vivo (el sync
 *     todavía no corrió a la hora de la reunión).
 *   - foxtrot_delivery_attempts (Supabase) → SOLO % rechazo (entregado vs
 *     rechazado) y CEq entregadas (para TLP).
 *   - articulos-factores (Chess, cacheado) → bultos/pallet y HL por bulto para
 *     cajas equivalentes (CEq) y hectolitros.
 *   - listDcs + findRoutesByDate + waypoints/deliveries (live) → rutas y carga HOY.
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
import {
  findRoutesByDate,
  listDcs,
  getRouteWaypoints,
  getWaypointDeliveries,
} from "@/lib/foxtrot"
import { getTmlFoxtrotRango } from "@/actions/tml-foxtrot"
import {
  getArticulosFactores,
  normNombre,
  type FactoresMap,
} from "@/lib/chess/articulos-factores"
import { getErroresPorFecha } from "@/lib/analia/client"

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
  /** Errores operativos de depósito (picking + descarga) por día. Fuente: Analía. */
  errores: Record<string, number | null>
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

/**
 * Corre `tasks` con un máximo de `limit` en paralelo. La API de Foxtrot no
 * tolera cientos de fetch simultáneos (socket hang up); el límite evita los
 * fallos silenciosos. Una tarea que falla no aborta al resto.
 */
async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  let idx = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), tasks.length || 1) },
    async () => {
      while (idx < tasks.length) {
        const cur = tasks[idx++]
        try {
          await cur()
        } catch {
          // ignorar la tarea que falló; las demás siguen
        }
      }
    },
  )
  await Promise.all(workers)
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
    errores: {},
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
    // Solo las rutas FINALIZADAS tienen tiempo de ruta y entregas reales.
    // Para una ruta en curso, Foxtrot devuelve un completion-time ESTIMADO
    // (ETA), que el sync guarda igual en tiempo_ruta_minutos. Si lo
    // promediáramos, el día en curso mostraría "horas en ruta" y "% entregas"
    // imposibles (los camiones recién salieron). Por eso las métricas de
    // tiempo/entregas/TLP se calculan solo sobre rutas finalizadas — mismo
    // criterio que /indicadores/tiempo-ruta-foxtrot (src/actions/foxtrot.ts).
    // La cantidad de camiones de HOY se cuenta aparte, en vivo (sección 3).
    const finalizada = r.is_finalized === true
    if (finalizada && r.tiempo_ruta_minutos != null && r.tiempo_ruta_minutos > 0) {
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
    if (finalizada) a.finalizadas++
    if (finalizada && r.tiempo_ruta_minutos != null && r.tiempo_ruta_minutos > 0) {
      a.tiempoSum += r.tiempo_ruta_minutos
      a.tiempoN++
    }
    if (finalizada) {
      a.totalDel += r.total_deliveries ?? 0
      a.successDel += r.deliveries_successful ?? 0
    }
    porFechaRoute.set(r.fecha, a)

    const authSec = r.raw_data?.tml_authorized_stops_seconds
    const visited = r.raw_data?.tml_visited_customers
    if (finalizada && authSec != null && visited != null && visited > 0) {
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

  // 2. Attempts (DB): SOLO % rechazo (bultos entregados vs rechazados) y las
  //    CEq ENTREGADAS por ruta que alimentan el TLP. Los bultos/HL/OB de CARGA
  //    ya NO salen de acá — ver manifiesto (paso 2b).
  const routeIdsFilter: string[] | null =
    sucursal === "todo" ? null : Array.from(fechaPorRuta.keys())
  const attempts = await fetchAttemptsRange(
    supabase,
    fechaDesde,
    fechaHasta,
    routeIdsFilter,
  )
  const factores: FactoresMap | null = await getArticulosFactores()

  // Consolidar attempts por (fecha, route_id, delivery_id) para tomar el último
  // status (vienen ordenados por timestamp).
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

  // % rechazo por fecha (en bultos) + CEq entregadas por ruta (para TLP).
  const rechazoPorFecha = new Map<string, { ok: number; rech: number }>()
  const ceqEntregadaPorRuta = new Map<string, number>()
  for (const g of dels.values()) {
    const last = g.statuses[g.statuses.length - 1]
    const entregado =
      last === "SUCCESSFUL" ||
      (last === "FAILED" && g.statuses.includes("SUCCESSFUL"))
    const rf = rechazoPorFecha.get(g.fecha) ?? { ok: 0, rech: 0 }
    if (last === "SUCCESSFUL") rf.ok += g.qty
    else if (last === "FAILED") {
      if (g.statuses.includes("SUCCESSFUL")) rf.ok += g.qty
      else rf.rech += g.qty
    }
    rechazoPorFecha.set(g.fecha, rf)

    if (entregado) {
      const fac = factores?.get(g.nm)
      if (fac && !fac.esEnvase && fac.bultosPallet > 0) {
        const ceq = (CAJA_PATRON * g.qty) / fac.bultosPallet
        ceqEntregadaPorRuta.set(
          g.routeId,
          (ceqEntregadaPorRuta.get(g.routeId) ?? 0) + ceq,
        )
      }
    }
  }
  for (const [f, r] of rechazoPorFecha) {
    const denom = r.ok + r.rech
    if (denom > 0) series.pct_rechazo[f] = round2((100 * r.rech) / denom)
  }

  // 2b. MANIFIESTO DE CARGA — "lo que salió a la calle" (entregado o no).
  //     Días cerrados → foxtrot_route_deliveries (lo puebla el sync).
  //     HOY → en vivo (paso 3), porque a la hora de la reunión el sync no corrió.
  type ManRow = { fecha: string; routeId: string; nm: string; qty: number }
  const manifest: ManRow[] = []
  {
    let from = 0
    for (let i = 0; i < 200; i++) {
      const { data, error } = await supabase
        .from("foxtrot_route_deliveries")
        .select("fecha, route_id, delivery_name, quantity")
        .in("dc_id", dcsActivos)
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .range(from, from + PAGE_SIZE - 1)
      if (error || !data || data.length === 0) break
      for (const d of data as Array<{
        fecha: string
        route_id: string
        delivery_name: string | null
        quantity: number | null
      }>) {
        manifest.push({
          fecha: d.fecha,
          routeId: d.route_id,
          nm: normNombre(d.delivery_name),
          qty: d.quantity ?? 0,
        })
      }
      if (data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
  }

  // 3. HOY en vivo: cantidad de camiones (rutas iniciadas) + manifiesto de carga
  //    del día. La carga es lo planificado en cada parada, exista o no un intento.
  if (fechas.includes(hoy)) {
    try {
      const dcsRes = await listDcs()
      if ("data" in dcsRes) {
        const dcs = dcsRes.data
          .filter((d) => MISIONES_DCS.has(d.id))
          .filter((d) => dcsActivos.includes(d.id))
        let activasHoy = 0
        const liveManifest: ManRow[] = []
        const tasks: Array<() => Promise<void>> = []
        for (const dc of dcs) {
          const rRes = await findRoutesByDate(dc.id, hoy)
          if (!("data" in rRes)) continue
          const startedRoutes = rRes.data.filter(
            (r) => r.started_timestamp != null,
          )
          activasHoy += startedRoutes.length
          for (const route of startedRoutes) {
            // las rutas de hoy ya están en DB (sync mañanero), pero por las dudas
            // registramos route→fecha para que OB las agregue al día de hoy.
            fechaPorRuta.set(route.id, hoy)
            tasks.push(async () => {
              const wpRes = await getRouteWaypoints(dc.id, route.id)
              if (!("data" in wpRes)) return
              for (const wp of wpRes.data) {
                if (!wp.waypoint_id) continue
                const dRes = await getWaypointDeliveries(
                  dc.id,
                  route.id,
                  wp.waypoint_id,
                )
                if (!("data" in dRes)) continue
                for (const d of dRes.data) {
                  liveManifest.push({
                    fecha: hoy,
                    routeId: route.id,
                    nm: normNombre(d.name),
                    qty: d.quantity ?? 0,
                  })
                }
              }
            })
          }
        }
        series.rutas_distribucion[hoy] = activasHoy
        // Concurrencia acotada (la API de Foxtrot no tolera cientos en paralelo).
        await runWithConcurrency(tasks, 8)
        // La foto en vivo reemplaza lo que hubiera de hoy en DB (sync parcial).
        if (liveManifest.length > 0) {
          for (let i = manifest.length - 1; i >= 0; i--) {
            if (manifest[i].fecha === hoy) manifest.splice(i, 1)
          }
          manifest.push(...liveManifest)
        }
      }
    } catch {
      // si falla el live, queda lo que haya en DB para hoy
    }
  }

  // Bultos / HL / OB(carga) desde el manifiesto. Envases excluidos solo de HL/CEq
  // (los bultos totales sí incluyen envases, igual que antes).
  const bultosManPorFecha = new Map<string, number>()
  const hlManPorFecha = new Map<string, number>()
  const ceqCargadaPorRuta = new Map<string, number>()
  for (const m of manifest) {
    bultosManPorFecha.set(
      m.fecha,
      (bultosManPorFecha.get(m.fecha) ?? 0) + m.qty,
    )
    const fac = factores?.get(m.nm)
    if (!fac || fac.esEnvase) continue
    if (fac.valorUM > 0) {
      hlManPorFecha.set(
        m.fecha,
        (hlManPorFecha.get(m.fecha) ?? 0) + fac.valorUM * m.qty,
      )
    }
    if (fac.bultosPallet > 0) {
      const ceq = (CAJA_PATRON * m.qty) / fac.bultosPallet
      ceqCargadaPorRuta.set(
        m.routeId,
        (ceqCargadaPorRuta.get(m.routeId) ?? 0) + ceq,
      )
    }
  }
  for (const [f, b] of bultosManPorFecha) {
    series.bultos_salida_reparto[f] = Math.round(b)
  }
  for (const [f, hl] of hlManPorFecha) series.hl[f] = Math.round(hl)

  // OB = promedio por ruta de las CEq CARGADAS (manifiesto).
  // TLP = promedio por ruta de CEq ENTREGADAS / (2 × horas), solo rutas con horas.
  type ObTlp = { ceqCargadaSum: number; nRutas: number; tlpSum: number; tlpN: number }
  const obtlp = new Map<string, ObTlp>()
  const rutasObTlp = new Set<string>([
    ...ceqCargadaPorRuta.keys(),
    ...ceqEntregadaPorRuta.keys(),
  ])
  for (const routeId of rutasObTlp) {
    const f = fechaPorRuta.get(routeId)
    if (!f) continue
    const o =
      obtlp.get(f) ?? { ceqCargadaSum: 0, nRutas: 0, tlpSum: 0, tlpN: 0 }
    const cargada = ceqCargadaPorRuta.get(routeId)
    if (cargada != null) {
      o.ceqCargadaSum += cargada
      o.nRutas++
    }
    const horas = horasPorRuta.get(routeId)
    if (horas && horas > 0) {
      o.tlpSum += (ceqEntregadaPorRuta.get(routeId) ?? 0) / (2 * horas)
      o.tlpN++
    }
    obtlp.set(f, o)
  }
  for (const [f, o] of obtlp) {
    if (o.nRutas > 0) series.ob[f] = Math.round(o.ceqCargadaSum / o.nRutas)
    if (o.tlpN > 0) series.tlp[f] = round2(o.tlpSum / o.tlpN)
  }

  // 3b. Errores operativos de depósito — Analía (público). No tiene desglose
  //     por sucursal (es un depósito central), se muestra igual en todas.
  try {
    const erroresPorFecha = await getErroresPorFecha()
    for (const f of fechas) {
      if (erroresPorFecha[f] != null) series.errores[f] = erroresPorFecha[f]
    }
  } catch {
    // si Analía no responde, queda vacío
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

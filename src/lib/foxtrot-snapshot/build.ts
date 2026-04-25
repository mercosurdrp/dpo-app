import {
  fxFetch,
  getCustomerMeta,
  getDriverLocation,
  getDrivers,
  getRouteDetail,
  getRoutesForDc,
  toMs,
  type Attempt,
  type Delivery,
  type RouteRaw,
  type Waypoint,
} from "./client"
import { getAnalyticsKm } from "./analytics"
import { dateRange, normalizeRouteName } from "./normalize"
import { loadZonas, zoneOfEldorado } from "./zonas"
import type {
  ClienteReiterante,
  ClienteRepase,
  FranjaHoraria,
  LiveTruck,
  MapPoint,
  MapWaypointAgg,
  RechazoItem,
  RechazoVisita,
  RouteRow,
  Snapshot,
  SnapshotKpis,
} from "./types"

interface PerRouteRaw {
  dc: string
  fecha: string
  raw_name: string
  norm_name: string
  driver_id: string | null
  driver_name: string
  route_id: string
  is_active: boolean
  is_finalized: boolean
  pdvs_total: number
  pdvs_done: number
  cids_total: Set<string>
  cids_done: Set<string>
  bultos_ok: number
  bultos_rech: number
  rechazos_count: number
  started_ts: number
  finalized_ts: number
  waypoints: Waypoint[]
  wp_stats: Record<string, WpStats>
  sku_rech_map: Record<string, number>
  motivo_map: Record<string, number>
  route_rech_visits: RouteRechVisit[]
  completed_timestamps: number[]
}

interface WpStats {
  bultos_ok: number
  bultos_rech: number
  service_sec: number | null
  service_source: "analytics" | "timestamps" | null
}

interface RouteRechVisit {
  cliente_id: string | null
  bultos: number
  motivos: string[]
  items: RechazoItem[]
}

interface UnifiedRoute {
  dc: string
  fecha: string
  ruta: string
  ruta_raw: string[]
  recarga: boolean
  num_vueltas: number
  route_ids: string[]
  driver_id: string | null
  chofer: string
  pdvs_total: number
  pdvs_done: number
  cids_total: Set<string>
  cids_done: Set<string>
  bultos_ok: number
  bultos_rech: number
  rechazos: number
  driven_m: number
  planned_m: number
  auth_stops_sec: number
  visited_custs_ana: number
  duracion_min: number | null
  activa: boolean
  finalizada: boolean
  cumplimiento_pct: number
  sku_rech_map: Record<string, number>
  motivo_map: Record<string, number>
  visits_with_rech: RouteRechVisit[]
  waypoints: Waypoint[]
  wp_stats: Record<string, WpStats>
  completed_timestamps: number[]
  avg_service_min?: number | null
  service_source?: "analytics" | "timestamps" | null
}

export async function buildSnapshot(opts: {
  dcs: string[]
  rng: string
  fromDate?: string | null
  toDate?: string | null
  zonaFilter?: string | null
}): Promise<Snapshot> {
  const { dcs, rng, fromDate, toDate, zonaFilter } = opts
  const dates = dateRange(rng, fromDate, toDate)

  const driversMaps: Record<string, Map<string, string>> = {}
  let allRoutes: RouteRaw[] = []
  for (const dc of dcs) {
    driversMaps[dc] = await getDrivers(dc)
    const rs = await getRoutesForDc(dc, dates)
    allRoutes.push(...rs)
  }

  await Promise.all(
    allRoutes.map(async (r) => {
      r._detail = await getRouteDetail(r._dc!, r.id)
    }),
  )

  const kmTask = allRoutes.length ? getAnalyticsKm(dcs, dates) : null

  const eldoradoCusts = new Set<string>()
  for (const r of allRoutes) {
    if (r._dc !== "eldorado") continue
    for (const wp of r._detail?.waypoints ?? []) {
      if (wp.customer_id) eldoradoCusts.add(wp.customer_id)
    }
  }
  const custMetaMap = new Map<string, { name: string; loc: [number, number] | null }>()
  if (eldoradoCusts.size) {
    await Promise.all(
      Array.from(eldoradoCusts).map(async (cid) => {
        const meta = await getCustomerMeta("eldorado", cid)
        custMetaMap.set(`eldorado/${cid}`, meta)
      }),
    )
  }

  const zonasData = await loadZonas()
  const wpZone = (dc: string, wp: Waypoint): string | null => {
    if (dc === "iguazu") return "Norte"
    if (dc !== "eldorado") return null
    if (!wp.customer_id) return null
    const meta = custMetaMap.get(`eldorado/${wp.customer_id}`)
    if (!meta?.loc) return null
    return zoneOfEldorado(meta.loc[0], meta.loc[1], zonasData)
  }

  const perRouteVisible = new Map<string, Waypoint[]>()
  for (const r of allRoutes) {
    const all = r._detail?.waypoints ?? []
    if (zonaFilter) {
      perRouteVisible.set(
        r.id,
        all.filter((wp) => wpZone(r._dc!, wp) === zonaFilter),
      )
    } else {
      perRouteVisible.set(r.id, all)
    }
  }

  if (zonaFilter) {
    allRoutes = allRoutes.filter((r) => (perRouteVisible.get(r.id) ?? []).length > 0)
  }

  const perRouteRaw: PerRouteRaw[] = []
  for (const r of allRoutes) {
    const wps = perRouteVisible.get(r.id) ?? []
    const driverId = r.assigned_driver_id ?? null
    const driverName = driverId
      ? driversMaps[r._dc!]?.get(driverId) ?? driverId
      : "—"
    const rawName = r.name ?? r.id.slice(0, 8)
    const normName = normalizeRouteName(rawName) || rawName

    const wpStats: Record<string, WpStats> = {}
    const skuMap: Record<string, number> = {}
    const motivoMap: Record<string, number> = {}
    let bultosOk = 0
    let bultosRech = 0
    let rechazosCount = 0
    let doneCount = 0
    const completedTs: number[] = []
    const visits: RouteRechVisit[] = []

    for (const wp of wps) {
      const wpid = wp.waypoint_id ?? wp.id ?? ""
      const isDone = wp.status === "COMPLETED" || !!wp.completed_timestamp
      if (isDone) {
        doneCount++
        if (wp.completed_timestamp) completedTs.push(wp.completed_timestamp)
      }
      let visitBultosOk = 0
      let visitBultosRech = 0
      const visitMotivos = new Set<string>()
      const visitItems: RechazoItem[] = []

      for (const d of wp.deliveries ?? []) {
        const qty = d.quantity ?? 0
        const atts = d.attempts ?? []
        if (atts.length === 0) continue
        const last: Attempt = atts[atts.length - 1]
        if (last.attempt_status === "SUCCESSFUL") {
          bultosOk += qty
          visitBultosOk += qty
        } else if (last.attempt_status === "FAILED") {
          bultosRech += qty
          rechazosCount++
          const motivo =
            last.delivery_message || last.delivery_code || last.driver_notes || "Sin motivo"
          motivoMap[motivo] = (motivoMap[motivo] ?? 0) + qty
          const prod = d.name ?? "(sin nombre)"
          skuMap[prod] = (skuMap[prod] ?? 0) + qty
          visitMotivos.add(motivo)
          visitBultosRech += qty
          const ts =
            toMs(last.timestamp) ||
            toMs(last.attempt_timestamp) ||
            toMs(wp.completed_timestamp)
          visitItems.push({
            producto: prod,
            cantidad: qty,
            motivo,
            codigo: last.delivery_code ?? null,
            notas: last.driver_notes ?? null,
            ts_ms: ts,
          })
        }
      }

      wpStats[wpid] = {
        bultos_ok: visitBultosOk,
        bultos_rech: visitBultosRech,
        service_sec: null,
        service_source: null,
      }

      if (visitItems.length > 0) {
        visits.push({
          cliente_id: wp.customer_id ?? null,
          bultos: visitBultosRech,
          motivos: Array.from(visitMotivos).sort(),
          items: visitItems,
        })
      }
    }

    const startedTs = toMs(r.started_timestamp) || toMs(r.start_time)
    const orderedWps = wps
      .filter((w) => w.completed_timestamp)
      .sort((a, b) => (a.completed_timestamp ?? 0) - (b.completed_timestamp ?? 0))
    let prevTs = startedTs || null
    for (const ow of orderedWps) {
      const cur = ow.completed_timestamp!
      const owid = ow.waypoint_id ?? ow.id ?? ""
      if (prevTs && wpStats[owid]) {
        const diffS = Math.floor((cur - prevTs) / 1000)
        if (diffS >= 60 && diffS <= 3 * 3600) {
          wpStats[owid].service_sec = diffS
          wpStats[owid].service_source = "timestamps"
        }
      }
      prevTs = cur
    }

    const cidsTotal = new Set<string>()
    const cidsDone = new Set<string>()
    for (const wp of wps) {
      const id = wp.customer_id ?? wp.waypoint_id ?? wp.id ?? ""
      cidsTotal.add(id)
      if (wp.status === "COMPLETED" || wp.completed_timestamp) cidsDone.add(id)
    }

    perRouteRaw.push({
      dc: r._dc!,
      fecha: r._date!,
      raw_name: rawName,
      norm_name: normName,
      driver_id: driverId,
      driver_name: driverName,
      route_id: r.id,
      is_active: !!r.is_active,
      is_finalized: !!r.is_finalized,
      pdvs_total: cidsTotal.size,
      pdvs_done: cidsDone.size,
      cids_total: cidsTotal,
      cids_done: cidsDone,
      bultos_ok: bultosOk,
      bultos_rech: bultosRech,
      rechazos_count: rechazosCount,
      started_ts: startedTs,
      finalized_ts: toMs(r.finalized_timestamp),
      waypoints: wps,
      wp_stats: wpStats,
      sku_rech_map: skuMap,
      motivo_map: motivoMap,
      route_rech_visits: visits,
      completed_timestamps: completedTs,
    })
  }

  let kmData: Awaited<ReturnType<typeof getAnalyticsKm>> = {
    status: "error",
    by_route_id: {},
    total_driven_m: 0,
    total_planned_m: 0,
  }
  if (kmTask) {
    try {
      kmData = await kmTask
    } catch {}
  }
  const anaMap = kmData.by_route_id

  const groups = new Map<string, PerRouteRaw[]>()
  for (const r of perRouteRaw) {
    const k = `${r.dc}|${r.fecha}|${r.driver_id ?? r.driver_name}|${r.norm_name}`
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }

  const unified: UnifiedRoute[] = []
  for (const subs of groups.values()) {
    const isRecarga =
      subs.some((s) => s.raw_name !== s.norm_name) || subs.length > 1
    const starts = subs.map((s) => s.started_ts).filter(Boolean)
    const ends = subs.map((s) => s.finalized_ts).filter(Boolean)
    let duracionMin: number | null = null
    if (starts.length && ends.length) {
      duracionMin = Math.max(0, Math.floor((Math.max(...ends) - Math.min(...starts)) / 60000))
    }
    let drivenM = 0
    let plannedM = 0
    let authSec = 0
    let visitedAna = 0
    for (const s of subs) {
      const a = anaMap[s.route_id]
      if (a) {
        drivenM += a.driven_m
        plannedM += a.planned_m
        authSec += a.auth_stops_sec
        visitedAna += a.visited_customers
      }
    }

    if (visitedAna > 0 && authSec > 0) {
      const avgSec = Math.floor(authSec / visitedAna)
      for (const s of subs) {
        for (const wid of Object.keys(s.wp_stats)) {
          const st = s.wp_stats[wid]
          if (st.bultos_ok > 0 || st.bultos_rech > 0) {
            st.service_sec = avgSec
            st.service_source = "analytics"
          }
        }
      }
    }

    const mergedSku: Record<string, number> = {}
    const mergedMotivo: Record<string, number> = {}
    for (const s of subs) {
      for (const [k, v] of Object.entries(s.sku_rech_map)) {
        mergedSku[k] = (mergedSku[k] ?? 0) + v
      }
      for (const [k, v] of Object.entries(s.motivo_map)) {
        mergedMotivo[k] = (mergedMotivo[k] ?? 0) + v
      }
    }

    const allVisits: RouteRechVisit[] = []
    for (const s of subs) {
      for (const v of s.route_rech_visits) allVisits.push(v)
    }
    const visitsByCust = new Map<
      string,
      { cliente_id: string | null; bultos: number; motivosSet: Set<string>; items: RechazoItem[] }
    >()
    for (const v of allVisits) {
      const ck = v.cliente_id ?? `anon-${Math.random()}`
      const e = visitsByCust.get(ck) ?? {
        cliente_id: v.cliente_id,
        bultos: 0,
        motivosSet: new Set<string>(),
        items: [],
      }
      e.bultos += v.bultos
      v.motivos.forEach((m) => e.motivosSet.add(m))
      e.items.push(...v.items)
      visitsByCust.set(ck, e)
    }
    const visitsMerged: RouteRechVisit[] = Array.from(visitsByCust.values()).map((x) => ({
      cliente_id: x.cliente_id,
      bultos: x.bultos,
      motivos: Array.from(x.motivosSet).sort(),
      items: x.items,
    }))

    const cidsTotalAll = new Set<string>()
    const cidsDoneAll = new Set<string>()
    for (const s of subs) {
      s.cids_total.forEach((c) => cidsTotalAll.add(c))
      s.cids_done.forEach((c) => cidsDoneAll.add(c))
    }

    unified.push({
      dc: subs[0].dc,
      fecha: subs[0].fecha,
      ruta: subs[0].norm_name,
      ruta_raw: subs.map((s) => s.raw_name),
      recarga: isRecarga && subs.length > 1,
      num_vueltas: subs.length,
      route_ids: subs.map((s) => s.route_id),
      driver_id: subs[0].driver_id,
      chofer: subs[0].driver_name,
      pdvs_total: cidsTotalAll.size,
      pdvs_done: cidsDoneAll.size,
      cids_total: cidsTotalAll,
      cids_done: cidsDoneAll,
      bultos_ok: subs.reduce((a, s) => a + s.bultos_ok, 0),
      bultos_rech: subs.reduce((a, s) => a + s.bultos_rech, 0),
      rechazos: subs.reduce((a, s) => a + s.rechazos_count, 0),
      driven_m: drivenM,
      planned_m: plannedM,
      auth_stops_sec: authSec,
      visited_custs_ana: visitedAna,
      duracion_min: duracionMin,
      activa: subs.some((s) => s.is_active && !s.is_finalized),
      finalizada: subs.every((s) => s.is_finalized),
      cumplimiento_pct: cidsTotalAll.size
        ? Math.round((1000 * cidsDoneAll.size) / cidsTotalAll.size) / 10
        : 0,
      sku_rech_map: mergedSku,
      motivo_map: mergedMotivo,
      visits_with_rech: visitsMerged,
      waypoints: subs.flatMap((s) => s.waypoints),
      wp_stats: Object.assign({}, ...subs.map((s) => s.wp_stats)),
      completed_timestamps: subs.flatMap((s) => s.completed_timestamps),
    })
  }

  const totalRutas = unified.length
  const finalized = unified.filter((r) => r.finalizada).length
  const active = unified.filter((r) => r.activa).length
  const allCidsTotal = new Set<string>()
  const allCidsDone = new Set<string>()
  for (const r of unified) {
    r.cids_total.forEach((c) => allCidsTotal.add(c))
    r.cids_done.forEach((c) => allCidsDone.add(c))
  }
  const pdvsTotal = allCidsTotal.size
  const pdvsCompleted = allCidsDone.size
  const bultosEntregados = unified.reduce((a, r) => a + r.bultos_ok, 0)
  const bultosRechazados = unified.reduce((a, r) => a + r.bultos_rech, 0)
  const totalDriven = unified.reduce((a, r) => a + r.driven_m, 0)
  const totalPlanned = unified.reduce((a, r) => a + r.planned_m, 0)

  let globalAuthSec = 0
  let globalVisited = 0
  const serviceTimesSec: number[] = []
  for (const r of unified) {
    const ts = [...r.completed_timestamps].sort((a, b) => a - b)
    const routeTimes: number[] = []
    for (let i = 1; i < ts.length; i++) {
      const diff = Math.floor((ts[i] - ts[i - 1]) / 1000)
      if (diff > 0 && diff < 3 * 3600) {
        serviceTimesSec.push(diff)
        routeTimes.push(diff)
      }
    }
    if (r.auth_stops_sec && r.visited_custs_ana) {
      r.avg_service_min = Math.round((r.auth_stops_sec / r.visited_custs_ana / 60) * 10) / 10
      r.service_source = "analytics"
      globalAuthSec += r.auth_stops_sec
      globalVisited += r.visited_custs_ana
    } else if (routeTimes.length) {
      r.avg_service_min =
        Math.round((routeTimes.reduce((a, b) => a + b, 0) / routeTimes.length / 60) * 10) / 10
      r.service_source = "timestamps"
    } else {
      r.avg_service_min = null
      r.service_source = null
    }
  }

  const duracionesRutas = unified.map((r) => r.duracion_min).filter((x): x is number => !!x)
  const bins = [0, 5, 10, 15, 20, 30, 60, 120]
  const hist = new Array(bins.length).fill(0)
  for (const s of serviceTimesSec) {
    const m = s / 60
    let placed = false
    for (let i = 1; i < bins.length; i++) {
      if (m < bins[i]) {
        hist[i - 1]++
        placed = true
        break
      }
    }
    if (!placed) hist[hist.length - 1]++
  }
  const histLabels: string[] = []
  for (let i = 1; i < bins.length; i++) histLabels.push(`${bins[i - 1]}-${bins[i]}m`)
  histLabels.push(`${bins[bins.length - 1]}m+`)

  const rechazosPorMotivo: Record<string, number> = {}
  const rechazosPorChofer: Record<string, number> = {}
  const rechazosPorSku: Record<string, number> = {}
  const visitsByChoferRutaCust = new Map<string, number>()
  for (const r of unified) {
    for (const [k, v] of Object.entries(r.motivo_map)) {
      rechazosPorMotivo[k] = (rechazosPorMotivo[k] ?? 0) + v
    }
    rechazosPorChofer[r.chofer] = (rechazosPorChofer[r.chofer] ?? 0) + r.bultos_rech
    for (const [k, v] of Object.entries(r.sku_rech_map)) {
      rechazosPorSku[k] = (rechazosPorSku[k] ?? 0) + v
    }
    for (const w of r.waypoints) {
      const cid = w.customer_id
      if (!cid || w.status !== "COMPLETED") continue
      const key = `${r.chofer}|${r.ruta}|${cid}`
      visitsByChoferRutaCust.set(key, (visitsByChoferRutaCust.get(key) ?? 0) + 1)
    }
  }

  const repasesPorChofer: Record<string, number> = {}
  for (const r of unified) {
    if (!(r.chofer in repasesPorChofer)) repasesPorChofer[r.chofer] = 0
  }
  for (const [key, count] of visitsByChoferRutaCust) {
    if (count > 1) {
      const chofer = key.split("|")[0]
      repasesPorChofer[chofer] = (repasesPorChofer[chofer] ?? 0) + (count - 1)
    }
  }

  // Resolver nombres faltantes para visits_with_rech (Iguazú no se prefetcheó)
  const missing = new Set<string>()
  for (const r of unified) {
    for (const v of r.visits_with_rech) {
      if (v.cliente_id && !custMetaMap.has(`${r.dc}/${v.cliente_id}`)) {
        missing.add(`${r.dc}/${v.cliente_id}`)
      }
    }
  }
  if (missing.size) {
    await Promise.all(
      Array.from(missing).map(async (key) => {
        const [dc, cid] = key.split("/")
        const meta = await getCustomerMeta(dc, cid)
        custMetaMap.set(key, meta)
      }),
    )
  }

  const rechazosDetalle: RechazoVisita[] = []
  for (const r of unified) {
    for (const v of r.visits_with_rech) {
      const meta = v.cliente_id ? custMetaMap.get(`${r.dc}/${v.cliente_id}`) : null
      rechazosDetalle.push({
        fecha: r.fecha,
        dc: r.dc,
        ruta: r.ruta,
        chofer: r.chofer,
        cliente_id: v.cliente_id,
        cliente_nombre: meta?.name ?? "",
        bultos: round2(v.bultos),
        motivos: v.motivos,
        items: v.items.map((it) => ({ ...it, cantidad: round2(it.cantidad) })),
      })
    }
  }

  const HOUR_BUCKETS: [number, number][] = [
    [6, 8],
    [8, 10],
    [10, 12],
    [12, 14],
    [14, 16],
    [16, 18],
    [18, 20],
    [20, 22],
  ]
  const OTROS = "Otros"
  const bucketLabels = HOUR_BUCKETS.map(([lo, hi]) =>
    `${pad(lo)}-${pad(hi)}`,
  ).concat(["otros"])
  const topMotivos = Object.entries(rechazosPorMotivo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k]) => k)
  const franjaMotivo: Record<string, Record<string, number>> = {}
  const franjaClientes: Record<string, Set<string>> = {}
  const franjaBultos: Record<string, number> = {}
  for (const lbl of bucketLabels) {
    franjaMotivo[lbl] = {}
    for (const m of topMotivos) franjaMotivo[lbl][m] = 0
    franjaMotivo[lbl][OTROS] = 0
    franjaClientes[lbl] = new Set<string>()
    franjaBultos[lbl] = 0
  }
  for (const r of unified) {
    for (const v of r.visits_with_rech) {
      for (const it of v.items) {
        if (!it.ts_ms) continue
        const arDate = new Date(it.ts_ms - 3 * 60 * 60 * 1000)
        const hour = arDate.getUTCHours()
        let bi = HOUR_BUCKETS.length
        for (let i = 0; i < HOUR_BUCKETS.length; i++) {
          if (hour >= HOUR_BUCKETS[i][0] && hour < HOUR_BUCKETS[i][1]) {
            bi = i
            break
          }
        }
        const lbl = bucketLabels[bi]
        const motivo = topMotivos.includes(it.motivo) ? it.motivo : OTROS
        franjaMotivo[lbl][motivo] = (franjaMotivo[lbl][motivo] ?? 0) + it.cantidad
        franjaBultos[lbl] += it.cantidad
        if (v.cliente_id) franjaClientes[lbl].add(v.cliente_id)
      }
    }
  }
  const rechazosFranja: FranjaHoraria = {
    labels: bucketLabels,
    motivos: [...topMotivos, OTROS],
    series: [...topMotivos, OTROS].map((m) => ({
      motivo: m,
      values: bucketLabels.map((lbl) => round2(franjaMotivo[lbl][m] ?? 0)),
    })),
    clientes_distintos: bucketLabels.map((lbl) => franjaClientes[lbl].size),
    bultos_total: bucketLabels.map((lbl) => round2(franjaBultos[lbl])),
  }

  const clientesReiterantes: ClienteReiterante[] = []
  if (dates.length > 1) {
    const totalVisitsByCust = new Map<string, number>()
    const totalPedidosByCust = new Map<string, number>()
    for (const r of unified) {
      for (const w of r.waypoints) {
        const cid = w.customer_id
        if (!cid) continue
        const k = `${r.dc}/${cid}`
        totalVisitsByCust.set(k, (totalVisitsByCust.get(k) ?? 0) + 1)
        const wpid = w.waypoint_id ?? w.id ?? ""
        const st = r.wp_stats[wpid] ?? null
        const sum = (st?.bultos_ok ?? 0) + (st?.bultos_rech ?? 0)
        totalPedidosByCust.set(k, (totalPedidosByCust.get(k) ?? 0) + sum)
      }
    }
    const agg = new Map<
      string,
      {
        dc: string
        cliente_id: string
        dias: Set<string>
        visitas_rech: number
        bultos_rech: number
        motivos: Record<string, number>
      }
    >()
    for (const r of unified) {
      for (const v of r.visits_with_rech) {
        if (!v.cliente_id) continue
        const k = `${r.dc}/${v.cliente_id}`
        const e = agg.get(k) ?? {
          dc: r.dc,
          cliente_id: v.cliente_id,
          dias: new Set<string>(),
          visitas_rech: 0,
          bultos_rech: 0,
          motivos: {},
        }
        e.dias.add(r.fecha)
        e.visitas_rech++
        e.bultos_rech += v.bultos
        for (const m of v.motivos) e.motivos[m] = (e.motivos[m] ?? 0) + 1
        agg.set(k, e)
      }
    }
    for (const [k, e] of agg) {
      if (e.dias.size < 2) continue
      const visitsTot = totalVisitsByCust.get(k) ?? e.visitas_rech
      const bultosPedidos = totalPedidosByCust.get(k) ?? e.bultos_rech
      const meta = custMetaMap.get(k)
      const motTop = Object.entries(e.motivos)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([m]) => m)
      clientesReiterantes.push({
        dc: e.dc,
        cliente_id: e.cliente_id,
        cliente_nombre: meta?.name ?? "",
        dias_con_rechazo: e.dias.size,
        visitas_con_rechazo: e.visitas_rech,
        visitas_totales: visitsTot,
        pct_rechazo_visitas: visitsTot
          ? round1((100 * e.visitas_rech) / visitsTot)
          : 0,
        bultos_rech: round2(e.bultos_rech),
        bultos_pedidos: round2(bultosPedidos),
        pct_rech_bultos: bultosPedidos ? round1((100 * e.bultos_rech) / bultosPedidos) : 0,
        motivos_top: motTop,
      })
    }
    clientesReiterantes.sort(
      (a, b) => b.pct_rech_bultos - a.pct_rech_bultos || b.bultos_rech - a.bultos_rech,
    )
  }

  const repasesAgg = new Map<
    string,
    {
      dc: string
      cliente_id: string
      visits: { ts: number; chofer: string; ruta: string }[]
      dias: Set<string>
      bultos_ok: number
    }
  >()
  for (const r of unified) {
    for (const w of r.waypoints) {
      if (w.status !== "COMPLETED") continue
      const cid = w.customer_id
      if (!cid) continue
      const k = `${r.dc}/${cid}`
      const e = repasesAgg.get(k) ?? {
        dc: r.dc,
        cliente_id: cid,
        visits: [],
        dias: new Set<string>(),
        bultos_ok: 0,
      }
      e.visits.push({ ts: w.completed_timestamp ?? 0, chofer: r.chofer, ruta: r.ruta })
      e.dias.add(r.fecha)
      const wpid = w.waypoint_id ?? w.id ?? ""
      const st = r.wp_stats[wpid]
      if (st) e.bultos_ok += st.bultos_ok
      repasesAgg.set(k, e)
    }
  }
  const sameTruckRepases = (
    e: NonNullable<ReturnType<typeof repasesAgg.get>>,
  ): { total: number; choferes: string[]; camiones: string[] } => {
    const byTruck = new Map<string, string[]>()
    for (const v of e.visits) {
      const arr = byTruck.get(v.ruta) ?? []
      arr.push(v.chofer)
      byTruck.set(v.ruta, arr)
    }
    let total = 0
    const trucksRep: string[] = []
    const choferSet = new Set<string>()
    for (const [t, chofs] of byTruck) {
      total += Math.max(0, chofs.length - 1)
      if (t && chofs.length >= 2) {
        trucksRep.push(t)
        for (const c of chofs) if (c) choferSet.add(c)
      }
    }
    return { total, choferes: Array.from(choferSet).sort(), camiones: trucksRep.sort() }
  }
  const missingRepases = new Set<string>()
  for (const [k, e] of repasesAgg) {
    if (sameTruckRepases(e).total >= 1 && !custMetaMap.has(k)) missingRepases.add(k)
  }
  if (missingRepases.size) {
    await Promise.all(
      Array.from(missingRepases).map(async (key) => {
        const [dc, cid] = key.split("/")
        const meta = await getCustomerMeta(dc, cid)
        custMetaMap.set(key, meta)
      }),
    )
  }
  const clientesRepases: ClienteRepase[] = []
  for (const [k, e] of repasesAgg) {
    const sr = sameTruckRepases(e)
    if (sr.total < 1) continue
    clientesRepases.push({
      dc: e.dc,
      cliente_id: e.cliente_id,
      cliente_nombre: custMetaMap.get(k)?.name ?? "",
      visitas: e.visits.length,
      repases: sr.total,
      dias_distintos: e.dias.size,
      choferes: sr.choferes,
      camiones: sr.camiones,
      bultos_ok: round2(e.bultos_ok),
    })
  }
  clientesRepases.sort(
    (a, b) =>
      b.repases - a.repases || b.visitas - a.visitas || a.cliente_id.localeCompare(b.cliente_id),
  )

  const routesTable: RouteRow[] = unified.map((r) => ({
    dc: r.dc,
    fecha: r.fecha,
    ruta: r.ruta,
    ruta_raw: r.ruta_raw,
    recarga: r.recarga,
    num_vueltas: r.num_vueltas,
    route_ids: r.route_ids,
    driver_id: r.driver_id,
    chofer: r.chofer,
    pdvs_total: r.pdvs_total,
    pdvs_done: r.pdvs_done,
    bultos_ok: round2(r.bultos_ok),
    bultos_rech: round2(r.bultos_rech),
    rechazos: r.rechazos,
    driven_m: r.driven_m,
    planned_m: r.planned_m,
    duracion_min: r.duracion_min,
    activa: r.activa,
    finalizada: r.finalizada,
    cumplimiento_pct: r.cumplimiento_pct,
    avg_service_min: r.avg_service_min ?? null,
    service_source: r.service_source ?? null,
  }))

  const mapPoints: MapPoint[] = unified.map((r) => {
    const byCust = new Map<string, MapWaypointAgg>()
    for (const w of r.waypoints) {
      const cid = w.customer_id
      if (!cid) continue
      const wpid = w.waypoint_id ?? w.id ?? ""
      const st = r.wp_stats[wpid] ?? {
        bultos_ok: 0,
        bultos_rech: 0,
        service_sec: null,
        service_source: null,
      }
      let agg = byCust.get(cid)
      if (!agg) {
        agg = {
          customer_id: cid,
          status: w.status ?? null,
          completed_ts: w.completed_timestamp ?? null,
          bultos_ok: 0,
          bultos_rech: 0,
          svc_ana_sum: 0,
          svc_ana_count: 0,
          svc_ts_sum: 0,
          svc_ts_count: 0,
          motivos_bultos: {},
        }
        byCust.set(cid, agg)
      }
      agg.bultos_ok += st.bultos_ok
      agg.bultos_rech += st.bultos_rech
      if (st.service_sec) {
        if (st.service_source === "analytics") {
          agg.svc_ana_sum += st.service_sec
          agg.svc_ana_count++
        } else {
          agg.svc_ts_sum += st.service_sec
          agg.svc_ts_count++
        }
      }
      if (w.status === "COMPLETED") agg.status = "COMPLETED"
      if (w.completed_timestamp) agg.completed_ts = w.completed_timestamp
    }
    for (const v of r.visits_with_rech) {
      if (!v.cliente_id) continue
      const agg = byCust.get(v.cliente_id)
      if (!agg) continue
      for (const it of v.items) {
        agg.motivos_bultos[it.motivo] = (agg.motivos_bultos[it.motivo] ?? 0) + it.cantidad
      }
    }
    for (const agg of byCust.values()) {
      agg.bultos_ok = round2(agg.bultos_ok)
      agg.bultos_rech = round2(agg.bultos_rech)
      const mb: Record<string, number> = {}
      for (const [k, v] of Object.entries(agg.motivos_bultos)) mb[k] = round2(v)
      agg.motivos_bultos = mb
    }
    return {
      dc: r.dc,
      ruta: r.ruta,
      chofer: r.chofer,
      waypoints: Array.from(byCust.values()),
    }
  })

  const allFinalized = totalRutas > 0 && unified.every((r) => r.finalizada)

  const liveTrucks: LiveTruck[] = []
  if (rng === "today") {
    const activeRutas = unified.filter((r) => !r.finalizada && r.driver_id)
    const locResults = await Promise.all(
      activeRutas.map((r) =>
        getDriverLocation(r.dc, r.driver_id!).catch(() => null),
      ),
    )
    const fallbackIdx: number[] = []
    const fallbackTs: Record<number, number> = {}
    const fallbackCust: Record<number, [string, string]> = {}
    for (let i = 0; i < locResults.length; i++) {
      if (!locResults[i]) {
        const r = activeRutas[i]
        const completed = r.waypoints.filter(
          (w) => w.status === "COMPLETED" && w.completed_timestamp && w.customer_id,
        )
        if (completed.length) {
          const last = completed.reduce((a, b) =>
            (a.completed_timestamp ?? 0) > (b.completed_timestamp ?? 0) ? a : b,
          )
          fallbackIdx.push(i)
          fallbackTs[i] = last.completed_timestamp ?? 0
          fallbackCust[i] = [r.dc, last.customer_id!]
        }
      }
    }
    const needFetch = fallbackIdx
      .map((i) => fallbackCust[i])
      .filter(([dc, cid]) => !custMetaMap.has(`${dc}/${cid}`))
    if (needFetch.length) {
      await Promise.all(
        needFetch.map(async ([dc, cid]) => {
          const meta = await getCustomerMeta(dc, cid)
          custMetaMap.set(`${dc}/${cid}`, meta)
        }),
      )
    }
    for (let i = 0; i < locResults.length; i++) {
      const r = activeRutas[i]
      const loc = locResults[i]
      let stale = false
      let final: { lat: number; lng: number; ts_ms: number } | null = loc
      if (!final) {
        if (!fallbackIdx.includes(i)) continue
        const meta = custMetaMap.get(`${fallbackCust[i][0]}/${fallbackCust[i][1]}`)
        if (!meta?.loc) continue
        final = { lat: meta.loc[0], lng: meta.loc[1], ts_ms: fallbackTs[i] }
        stale = true
      }
      liveTrucks.push({
        dc: r.dc,
        chofer: r.chofer,
        ruta: r.ruta,
        lat: final.lat,
        lng: final.lng,
        ts_ms: final.ts_ms,
        stale,
      })
    }
  }

  const avgServiceMin =
    globalVisited > 0
      ? round1(globalAuthSec / globalVisited / 60)
      : serviceTimesSec.length
        ? round1(serviceTimesSec.reduce((a, b) => a + b, 0) / serviceTimesSec.length / 60)
        : 0
  const avgRutaMin = duracionesRutas.length
    ? Math.floor(duracionesRutas.reduce((a, b) => a + b, 0) / duracionesRutas.length)
    : 0

  const kpis: SnapshotKpis = {
    total_rutas: totalRutas,
    finalized,
    active,
    pdvs_total: pdvsTotal,
    pdvs_completed: pdvsCompleted,
    pdvs_pct: pdvsTotal ? round1((100 * pdvsCompleted) / pdvsTotal) : 0,
    bultos_entregados: Math.floor(bultosEntregados),
    bultos_rechazados: Math.floor(bultosRechazados),
    pct_rechazo: bultosEntregados + bultosRechazados
      ? round2((100 * bultosRechazados) / (bultosEntregados + bultosRechazados))
      : 0,
    rechazos_count: unified.reduce((a, r) => a + r.visits_with_rech.length, 0),
    avg_service_min: avgServiceMin,
    avg_ruta_min: avgRutaMin,
    km_driven: totalDriven ? round1(totalDriven / 1000) : null,
    km_planned: totalPlanned ? round1(totalPlanned / 1000) : null,
    km_status: kmData.status,
  }

  return {
    range: rng,
    dates,
    dcs,
    generated_at: new Date().toISOString(),
    all_finalized: allFinalized,
    km_status: kmData.status,
    kpis,
    routes: routesTable,
    rechazos_por_motivo: Object.entries(rechazosPorMotivo)
      .sort(([, a], [, b]) => b - a)
      .map(([motivo, cantidad]) => ({ motivo, cantidad: round2(cantidad) })),
    rechazos_por_chofer: Object.entries(rechazosPorChofer)
      .sort(([a, av], [b, bv]) => bv - av || a.localeCompare(b))
      .map(([chofer, cantidad]) => ({ chofer, cantidad: round2(cantidad) })),
    rechazos_por_sku: Object.entries(rechazosPorSku)
      .sort(([, a], [, b]) => b - a)
      .map(([sku, bultos]) => ({ sku, bultos: round2(bultos) })),
    rechazos_detalle: rechazosDetalle,
    rechazos_franja_horaria: rechazosFranja,
    clientes_reiterantes: clientesReiterantes,
    clientes_repases: clientesRepases,
    service_time_hist: { labels: histLabels, values: hist },
    repases_por_chofer: Object.entries(repasesPorChofer)
      .sort(([a, av], [b, bv]) => bv - av || a.localeCompare(b))
      .map(([chofer, cantidad]) => ({ chofer, cantidad })),
    map_points: mapPoints,
    live_trucks: liveTrucks,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export async function getCustomerLocation(dc: string, cid: string) {
  const r = await fxFetch<{
    data?: {
      customer?: {
        name?: string
        imported_address?: string
        inferred_location?: { latitude?: number; longitude?: number }
        imported_location?: { latitude?: number; longitude?: number }
      }
    }
  }>(`/dcs/${dc}/customers/${cid}`, { ttl: 60 * 60_000 })
  const cust = r.data?.customer
  if (!cust) return { location: null, name: null, address: null }
  let loc: { latitude: number; longitude: number; source: string } | null = null
  if (cust.inferred_location?.latitude && cust.inferred_location.longitude) {
    loc = {
      latitude: cust.inferred_location.latitude,
      longitude: cust.inferred_location.longitude,
      source: "inferred",
    }
  } else if (cust.imported_location?.latitude && cust.imported_location.longitude) {
    loc = {
      latitude: cust.imported_location.latitude,
      longitude: cust.imported_location.longitude,
      source: "imported",
    }
  }
  return {
    location: loc,
    name: cust.name ?? null,
    address: cust.imported_address ?? null,
  }
}

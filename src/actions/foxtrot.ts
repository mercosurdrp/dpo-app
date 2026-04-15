"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { registerActivity } from "@/lib/dpo-activity"
import { syncFoxtrotDay } from "@/lib/foxtrot-sync"
import type {
  FoxtrotRoute,
  FoxtrotDriverLocation,
  FoxtrotSyncLog,
  FoxtrotKpis,
  FoxtrotDriverMapping,
  FoxtrotWaypointVisita,
  FoxtrotDeliveryAttempt,
  FoxtrotRechazoAgregado,
  FoxtrotDashboardData,
  FoxtrotDriverRow,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }

function monthRange(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export async function getFoxtrotKpis(): Promise<Result<FoxtrotKpis>> {
  await requireAuth()
  const supabase = await createClient()

  const now = new Date()
  const { start, end } = monthRange(now)
  const today = now.toISOString().slice(0, 10)

  const { data: mesRows, error: mesErr } = await supabase
    .from("foxtrot_routes")
    .select("tiempo_ruta_minutos, pct_tracking_activo, is_active, is_finalized, fecha")
    .gte("fecha", start)
    .lt("fecha", end)

  if (mesErr) return { error: mesErr.message }

  const mes = mesRows ?? []
  const totalRutasMes = mes.length
  const trackingVals = mes
    .map((r) => r.pct_tracking_activo)
    .filter((v): v is number => v !== null && v !== undefined)
  const pctTrackingActivoMes =
    trackingVals.length > 0
      ? Number((trackingVals.reduce((a, b) => a + b, 0) / trackingVals.length).toFixed(2))
      : 0

  const finalizadas = mes.filter(
    (r) => r.is_finalized === true && r.tiempo_ruta_minutos !== null
  )
  const tiempoRutaPromedioMinutos =
    finalizadas.length > 0
      ? Math.round(
          finalizadas.reduce((a, r) => a + (r.tiempo_ruta_minutos ?? 0), 0) /
            finalizadas.length
        )
      : 0
  const tiempoRutaDentroMeta = finalizadas.filter(
    (r) => (r.tiempo_ruta_minutos ?? 99999) <= 480
  ).length
  const tiempoRutaPctDentroMeta =
    finalizadas.length > 0
      ? Number(((tiempoRutaDentroMeta / finalizadas.length) * 100).toFixed(2))
      : 0

  const rutasHoy = mes.filter((r) => r.fecha === today).length
  const rutasActivasAhora = mes.filter(
    (r) => r.fecha === today && r.is_active === true && r.is_finalized !== true
  ).length

  const { data: lastSync } = await supabase
    .from("foxtrot_sync_log")
    .select("finished_at")
    .eq("ok", true)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const seisMesesAtras = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const { data: histRows } = await supabase
    .from("foxtrot_routes")
    .select("fecha, tiempo_ruta_minutos, pct_tracking_activo")
    .gte("fecha", seisMesesAtras.toISOString().slice(0, 10))

  const mensualMap = new Map<
    string,
    { total: number; tiempos: number[]; trackings: number[]; year: number; mes: number }
  >()
  for (const r of histRows ?? []) {
    const d = new Date(r.fecha)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    const entry = mensualMap.get(key) ?? {
      total: 0,
      tiempos: [],
      trackings: [],
      year: d.getFullYear(),
      mes: d.getMonth() + 1,
    }
    entry.total++
    if (r.tiempo_ruta_minutos !== null) entry.tiempos.push(r.tiempo_ruta_minutos)
    if (r.pct_tracking_activo !== null) entry.trackings.push(r.pct_tracking_activo)
    mensualMap.set(key, entry)
  }

  const mensual = Array.from(mensualMap.values())
    .sort((a, b) => a.year - b.year || a.mes - b.mes)
    .map((e) => ({
      year: e.year,
      mes: e.mes,
      total_rutas: e.total,
      promedio_tiempo_ruta:
        e.tiempos.length > 0
          ? Math.round(e.tiempos.reduce((a, b) => a + b, 0) / e.tiempos.length)
          : 0,
      pct_tracking:
        e.trackings.length > 0
          ? Number(
              (e.trackings.reduce((a, b) => a + b, 0) / e.trackings.length).toFixed(2)
            )
          : 0,
    }))

  return {
    data: {
      totalRutasMes,
      pctTrackingActivoMes,
      tiempoRutaPromedioMinutos,
      tiempoRutaDentroMeta,
      tiempoRutaPctDentroMeta,
      rutasHoy,
      rutasActivasAhora,
      ultimaSincronizacion: lastSync?.finished_at ?? null,
      mensual,
    },
  }
}

export async function getFoxtrotRoutes(filters?: {
  fecha?: string
  driverName?: string
  dominio?: string
  limit?: number
}): Promise<Result<FoxtrotRoute[]>> {
  await requireAuth()
  const supabase = await createClient()

  let query = supabase
    .from("foxtrot_routes")
    .select("*")
    .order("fecha", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(filters?.limit ?? 200)

  if (filters?.fecha) query = query.eq("fecha", filters.fecha)
  if (filters?.driverName) query = query.ilike("driver_name", `%${filters.driverName}%`)
  if (filters?.dominio) query = query.ilike("dominio", `%${filters.dominio}%`)

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: (data ?? []) as FoxtrotRoute[] }
}

export async function getFoxtrotDriverLocationsHoy(): Promise<
  Result<FoxtrotDriverLocation[]>
> {
  await requireAuth()
  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("foxtrot_driver_locations")
    .select("*")
    .eq("fecha", today)
    .order("timestamp", { ascending: false })

  if (error) return { error: error.message }

  // WHY: one row per driver = most recent
  const byDriver = new Map<string, FoxtrotDriverLocation>()
  for (const row of (data ?? []) as FoxtrotDriverLocation[]) {
    if (!byDriver.has(row.driver_id)) byDriver.set(row.driver_id, row)
  }
  return { data: Array.from(byDriver.values()) }
}

export async function getFoxtrotSyncLogs(
  limit = 20
): Promise<Result<FoxtrotSyncLog[]>> {
  await requireAuth()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("foxtrot_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit)

  if (error) return { error: error.message }
  return { data: (data ?? []) as FoxtrotSyncLog[] }
}

export async function syncFoxtrotNow(
  fecha?: string
): Promise<Result<FoxtrotSyncLog>> {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    return { error: "Solo admins pueden disparar sync manual" }
  }

  const supabase = await createClient()
  const targetFecha = fecha ?? new Date().toISOString().slice(0, 10)
  try {
    const log = await syncFoxtrotDay(supabase, targetFecha)

    await registerActivity(supabase, {
      tipo: "sync_foxtrot",
      titulo: `Sincronización Foxtrot — ${targetFecha}`,
      pilar_codigo: "entrega",
      punto_codigo: "1.2",
      requisito_codigo: "R1.2.4",
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { rutas_sincronizadas: log.rutas_sincronizadas, ok: log.ok },
    })

    return { data: log }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function upsertFoxtrotDriverMapping(input: {
  foxtrot_driver_id: string
  foxtrot_driver_name: string
  empleado_id?: string | null
  notas?: string | null
}): Promise<Result<FoxtrotDriverMapping>> {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    return { error: "Solo admins pueden editar mapeos" }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("foxtrot_driver_mapping")
    .upsert(
      {
        foxtrot_driver_id: input.foxtrot_driver_id,
        foxtrot_driver_name: input.foxtrot_driver_name,
        empleado_id: input.empleado_id ?? null,
        notas: input.notas ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "foxtrot_driver_id" }
    )
    .select()
    .single()

  if (error) return { error: error.message }
  return { data: data as FoxtrotDriverMapping }
}

// ==================== DETALLE DE RUTA ====================
export async function getFoxtrotRouteDetalle(
  route_id: string,
): Promise<
  | {
      data: {
        route: FoxtrotRoute
        visits: FoxtrotWaypointVisita[]
        attempts: FoxtrotDeliveryAttempt[]
      }
    }
  | { error: string }
> {
  await requireAuth()
  const supabase = await createClient()

  const [rRes, vRes, aRes] = await Promise.all([
    supabase.from("foxtrot_routes").select("*").eq("route_id", route_id).single(),
    supabase
      .from("foxtrot_waypoints_visita")
      .select("*")
      .eq("route_id", route_id)
      .order("completed_timestamp", { ascending: true, nullsFirst: false }),
    supabase
      .from("foxtrot_delivery_attempts")
      .select("*")
      .eq("route_id", route_id)
      .order("attempt_timestamp", { ascending: false }),
  ])

  if (rRes.error) return { error: rRes.error.message }
  if (vRes.error) return { error: vRes.error.message }
  if (aRes.error) return { error: aRes.error.message }

  return {
    data: {
      route: rRes.data as FoxtrotRoute,
      visits: (vRes.data || []) as FoxtrotWaypointVisita[],
      attempts: (aRes.data || []) as FoxtrotDeliveryAttempt[],
    },
  }
}

// ==================== RECHAZOS AGREGADOS ====================
export async function getFoxtrotRechazos(filters?: {
  fecha?: string
  fechaDesde?: string
  fechaHasta?: string
}): Promise<
  | {
      data: {
        total: number
        attempts: FoxtrotDeliveryAttempt[]
        porCliente: FoxtrotRechazoAgregado[]
        porSku: FoxtrotRechazoAgregado[]
        porMotivo: FoxtrotRechazoAgregado[]
      }
    }
  | { error: string }
> {
  await requireAuth()
  const supabase = await createClient()

  let q = supabase
    .from("foxtrot_delivery_attempts")
    .select("*")
    .eq("attempt_status", "FAILED")
    .order("attempt_timestamp", { ascending: false })
    .limit(1000)

  if (filters?.fecha) q = q.eq("fecha", filters.fecha)
  if (filters?.fechaDesde) q = q.gte("fecha", filters.fechaDesde)
  if (filters?.fechaHasta) q = q.lte("fecha", filters.fechaHasta)

  const { data, error } = await q
  if (error) return { error: error.message }

  const attempts = (data || []) as FoxtrotDeliveryAttempt[]

  function agrupar(
    keyFn: (a: FoxtrotDeliveryAttempt) => string | null,
    labelFn: (a: FoxtrotDeliveryAttempt) => string,
  ): FoxtrotRechazoAgregado[] {
    const map = new Map<string, { count: number; label: string; ejemplos: FoxtrotDeliveryAttempt[] }>()
    for (const a of attempts) {
      const k = keyFn(a)
      if (!k) continue
      const g = map.get(k) ?? { count: 0, label: labelFn(a), ejemplos: [] }
      g.count++
      if (g.ejemplos.length < 3) g.ejemplos.push(a)
      map.set(k, g)
    }
    return Array.from(map.entries())
      .map(([key, g]) => ({ key, label: g.label, count: g.count, ejemplos: g.ejemplos }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 20)
  }

  return {
    data: {
      total: attempts.length,
      attempts: attempts.slice(0, 100),
      porCliente: agrupar(
        (a) => a.customer_id,
        (a) => a.customer_id ?? "—",
      ),
      porSku: agrupar(
        (a) => a.delivery_name,
        (a) => a.delivery_name ?? "—",
      ),
      porMotivo: agrupar(
        (a) => a.delivery_code || a.driver_notes || a.delivery_message || null,
        (a) => a.delivery_code || a.driver_notes || a.delivery_message || "Sin motivo",
      ),
    },
  }
}

// ==================== DASHBOARD FOXTROT (replica nativa) ====================
export async function getFoxtrotDashboard(
  fecha?: string,
): Promise<Result<FoxtrotDashboardData>> {
  await requireAuth()
  const supabase = await createClient()

  const targetFecha = fecha ?? new Date().toISOString().slice(0, 10)

  const [routesRes, visitsRes, attemptsRes, locsRes] = await Promise.all([
    supabase
      .from("foxtrot_routes")
      .select("*")
      .eq("fecha", targetFecha)
      .order("driver_name", { ascending: true }),
    supabase
      .from("foxtrot_waypoints_visita")
      .select("*")
      .eq("fecha", targetFecha),
    supabase
      .from("foxtrot_delivery_attempts")
      .select("*")
      .eq("fecha", targetFecha),
    supabase
      .from("foxtrot_driver_locations")
      .select("*")
      .eq("fecha", targetFecha)
      .order("timestamp", { ascending: false }),
  ])

  if (routesRes.error) return { error: routesRes.error.message }
  if (visitsRes.error) return { error: visitsRes.error.message }
  if (attemptsRes.error) return { error: attemptsRes.error.message }
  if (locsRes.error) return { error: locsRes.error.message }

  const routes = (routesRes.data ?? []) as FoxtrotRoute[]
  const visits = (visitsRes.data ?? []) as FoxtrotWaypointVisita[]
  const attempts = (attemptsRes.data ?? []) as FoxtrotDeliveryAttempt[]
  const locs = (locsRes.data ?? []) as FoxtrotDriverLocation[]

  // WHY: one location row per driver = most recent
  const locByDriver = new Map<string, FoxtrotDriverLocation>()
  for (const l of locs) {
    if (!locByDriver.has(l.driver_id)) locByDriver.set(l.driver_id, l)
  }
  const driverLocations = Array.from(locByDriver.values())

  // index routes by driver and build route_id -> driver_id map
  const routeIdToDriver = new Map<string, string>()
  const driverRoutes = new Map<string, FoxtrotRoute[]>()
  for (const r of routes) {
    routeIdToDriver.set(r.route_id, r.driver_id)
    const arr = driverRoutes.get(r.driver_id) ?? []
    arr.push(r)
    driverRoutes.set(r.driver_id, arr)
  }

  // index attempts by waypoint (route_id + waypoint_id)
  const wpKey = (routeId: string, waypointId: string) => `${routeId}::${waypointId}`
  const attemptsByWp = new Map<string, FoxtrotDeliveryAttempt[]>()
  for (const a of attempts) {
    const k = wpKey(a.route_id, a.waypoint_id)
    const arr = attemptsByWp.get(k) ?? []
    arr.push(a)
    attemptsByWp.set(k, arr)
  }

  // index visits by driver
  const visitsByDriver = new Map<string, FoxtrotWaypointVisita[]>()
  for (const v of visits) {
    const drv = routeIdToDriver.get(v.route_id)
    if (!drv) continue
    const arr = visitsByDriver.get(drv) ?? []
    arr.push(v)
    visitsByDriver.set(drv, arr)
  }

  const drivers: FoxtrotDriverRow[] = []
  for (const [driver_id, rs] of driverRoutes.entries()) {
    const driver_name = rs[0].driver_name
    const dc_id = rs[0].dc_id
    const route_ids = rs.map((r) => r.route_id)
    const tiempo_productivo_minutos = rs.reduce(
      (a, r) => a + (r.tiempo_ruta_minutos ?? 0),
      0,
    )
    const visitas_planeadas = rs.reduce((a, r) => a + (r.total_waypoints ?? 0), 0)

    const drvVisits = visitsByDriver.get(driver_id) ?? []
    const visitas_hechas = drvVisits.filter((v) => v.status === "COMPLETED").length

    let visitas_exitosas = 0
    let visitas_fracasos = 0
    let visitas_reintentos = 0
    for (const v of drvVisits) {
      const wpAttempts = attemptsByWp.get(wpKey(v.route_id, v.waypoint_id)) ?? []
      const hasFailed = wpAttempts.some((a) => a.attempt_status === "FAILED")
      const hasVisitLater = wpAttempts.some((a) => a.attempt_status === "VISIT_LATER")
      if (hasFailed) visitas_fracasos++
      if (hasVisitLater) visitas_reintentos++
      // WHY: exitosa = completada sin ningún intento fallido
      if (v.status === "COMPLETED" && !hasFailed) visitas_exitosas++
    }

    const loc = locByDriver.get(driver_id) ?? null
    drivers.push({
      driver_id,
      driver_name,
      dc_id,
      rutas: rs.length,
      tiempo_productivo_minutos,
      visitas_planeadas,
      visitas_hechas,
      visitas_exitosas,
      visitas_fracasos,
      visitas_reintentos,
      tiempo_total_minutos: tiempo_productivo_minutos,
      ultima_ubicacion: loc
        ? { latitud: loc.latitud, longitud: loc.longitud, timestamp: loc.timestamp }
        : null,
      route_ids,
    })
  }

  const kpis = {
    choferes: drivers.length,
    rutas: routes.length,
    visitas: drivers.reduce((a, d) => a + d.visitas_hechas, 0),
    exitosas: drivers.reduce((a, d) => a + d.visitas_exitosas, 0),
    reintentos: drivers.reduce((a, d) => a + d.visitas_reintentos, 0),
    rechazadas: drivers.reduce((a, d) => a + d.visitas_fracasos, 0),
    fracasadas_total: attempts.filter((a) => a.attempt_status === "FAILED").length,
    visitas_planeadas: drivers.reduce((a, d) => a + d.visitas_planeadas, 0),
  }

  const customersSet = new Set<string>()
  const customersVisitedSet = new Set<string>()
  for (const v of visits) {
    if (!v.customer_id) continue
    customersSet.add(v.customer_id)
    if (v.status === "COMPLETED") customersVisitedSet.add(v.customer_id)
  }
  const total_clientes = customersSet.size
  const clientes_visitados = customersVisitedSet.size

  return {
    data: {
      fecha: targetFecha,
      kpis,
      drivers,
      driverLocations,
      warehousesLocation: null,
      customersSummary: {
        total_clientes,
        clientes_visitados,
        clientes_pendientes: Math.max(0, total_clientes - clientes_visitados),
      },
    },
  }
}

// WHY: v1 devuelve solo driver locations como pins; customers lat/lng no están persistidos aún
export async function getFoxtrotRouteMarkers(
  fecha?: string,
): Promise<Result<{ drivers: FoxtrotDriverLocation[]; customers: [] }>> {
  await requireAuth()
  const supabase = await createClient()

  const targetFecha = fecha ?? new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("foxtrot_driver_locations")
    .select("*")
    .eq("fecha", targetFecha)
    .order("timestamp", { ascending: false })

  if (error) return { error: error.message }

  const byDriver = new Map<string, FoxtrotDriverLocation>()
  for (const row of (data ?? []) as FoxtrotDriverLocation[]) {
    if (!byDriver.has(row.driver_id)) byDriver.set(row.driver_id, row)
  }
  return { data: { drivers: Array.from(byDriver.values()), customers: [] } }
}

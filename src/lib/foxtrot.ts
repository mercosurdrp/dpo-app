const FOXTROT_BASE_URL = "https://apiv1.foxtrotsystems.com"
const FOXTROT_TIMEOUT_MS = 15000

export interface FoxtrotDc {
  id: string
  name: string
  time_zone?: string
}

export interface FoxtrotDriver {
  id: string
  name: string
  login_token?: string
}

export interface FoxtrotLocation {
  timestamp: number
  location: { latitude: number; longitude: number }
}

export interface FoxtrotActiveRoute {
  route_id: string
  planned_start_time?: number
}

export interface FoxtrotRouteRaw {
  id: string
  name?: string
  assigned_driver_id?: string
  start_time?: number
  start_warehouse_id?: string
  end_warehouse_id?: string
  vehicle_id?: string | null
  version?: number
  waypoint_ids?: string[]
  is_active?: boolean
  is_finalized?: boolean
}

export interface FoxtrotCompletionTime {
  type: "ESTIMATED" | "ACTUAL" | "FINALIZED"
  timestamp: number
}

export interface FoxtrotWaypoint {
  id: string
  location?: { latitude: number; longitude: number }
  service_time_minutes?: number
}

export type FoxtrotAttemptStatus = "SUCCESSFUL" | "FAILED" | "VISIT_LATER"

export interface FoxtrotAttempt {
  attempt_status: FoxtrotAttemptStatus
  timestamp?: number
  driver_notes?: string
  delivery_code?: string
  delivery_message?: string
}

export interface FoxtrotDelivery {
  id: string
  name?: string
  quantity?: number
  attempts?: FoxtrotAttempt[]
}

export type FoxtrotResult<T> = { data: T } | { error: string }

function getApiKey(): string | null {
  const key = process.env.FOXTROT_API_KEY
  if (!key || key.trim() === "") return null
  return key
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<FoxtrotResult<T>> {
  const apiKey = getApiKey()
  if (!apiKey) return { error: "FOXTROT_API_KEY no configurada" }

  const url = `${FOXTROT_BASE_URL}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }

  let lastError = ""
  // WHY: retry only on 5xx; 500ms then 1000ms backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(FOXTROT_TIMEOUT_MS),
      })

      if (res.status === 401 || res.status === 403) {
        return { error: `Foxtrot auth error ${res.status}` }
      }
      if (res.status === 404) {
        return { error: `Foxtrot 404: ${path}` }
      }
      if (res.status >= 500) {
        lastError = `Foxtrot ${res.status} en ${path}`
        if (attempt < 2) {
          await sleep(attempt === 0 ? 500 : 1000)
          continue
        }
        return { error: lastError }
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        return { error: `Foxtrot ${res.status}: ${text.slice(0, 200)}` }
      }

      const json = (await res.json()) as { status?: string; data?: T; message?: string }
      if (json.status && json.status !== "success") {
        return { error: `Foxtrot status=${json.status}: ${json.message ?? ""}` }
      }
      return { data: (json.data ?? (json as unknown as T)) as T }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      if (attempt < 2) {
        await sleep(attempt === 0 ? 500 : 1000)
        continue
      }
      return { error: `Foxtrot fetch error: ${lastError}` }
    }
  }
  return { error: lastError || "Foxtrot unknown error" }
}

export async function listDcs(): Promise<FoxtrotResult<FoxtrotDc[]>> {
  const r = await request<{ dcs: FoxtrotDc[] }>("/dcs")
  if ("error" in r) return r
  return { data: r.data.dcs ?? [] }
}

export async function listDrivers(
  dcId: string
): Promise<FoxtrotResult<FoxtrotDriver[]>> {
  const r = await request<{ drivers: FoxtrotDriver[] }>(`/dcs/${dcId}/drivers`)
  if ("error" in r) return r
  return { data: r.data.drivers ?? [] }
}

export async function getDriverLocation(
  dcId: string,
  driverId: string
): Promise<FoxtrotResult<FoxtrotLocation | null>> {
  const r = await request<{ driver_location: FoxtrotLocation | null }>(
    `/dcs/${dcId}/drivers/${driverId}/location`
  )
  if ("error" in r) return r
  return { data: r.data.driver_location ?? null }
}

export async function getActiveRoutes(
  dcId: string,
  driverId: string
): Promise<FoxtrotResult<FoxtrotActiveRoute[]>> {
  const r = await request<{ active_routes: FoxtrotActiveRoute[] }>(
    `/dcs/${dcId}/drivers/${driverId}/active-routes`
  )
  if ("error" in r) return r
  return { data: r.data.active_routes ?? [] }
}

export async function findRoutesByDate(
  dcId: string,
  date: string
): Promise<FoxtrotResult<FoxtrotRouteRaw[]>> {
  const r = await request<
    | { routes: FoxtrotRouteRaw[] }
    | { route_ids: string[] }
    | FoxtrotRouteRaw[]
  >(`/dcs/${dcId}/routes/find_by_date/${date}`)
  if ("error" in r) return r

  const data = r.data as unknown

  if (Array.isArray(data)) {
    return { data: data as FoxtrotRouteRaw[] }
  }
  if (data && typeof data === "object") {
    const obj = data as { routes?: FoxtrotRouteRaw[]; route_ids?: string[] }
    if (Array.isArray(obj.routes)) return { data: obj.routes }
    if (Array.isArray(obj.route_ids)) {
      // WHY: endpoint may return only ids; fetch each route individually
      const routes: FoxtrotRouteRaw[] = []
      for (const id of obj.route_ids) {
        const rr = await getRoute(dcId, id)
        if ("data" in rr) routes.push(rr.data)
      }
      return { data: routes }
    }
  }
  return { data: [] }
}

export async function getRoute(
  dcId: string,
  routeId: string
): Promise<FoxtrotResult<FoxtrotRouteRaw>> {
  const r = await request<{ route: FoxtrotRouteRaw }>(
    `/dcs/${dcId}/routes/${routeId}`
  )
  if ("error" in r) return r
  return { data: r.data.route }
}

export async function getRouteCompletionTime(
  dcId: string,
  routeId: string
): Promise<FoxtrotResult<FoxtrotCompletionTime | null>> {
  const r = await request<FoxtrotCompletionTime>(
    `/dcs/${dcId}/routes/${routeId}/completion-time`
  )
  if ("error" in r) {
    if (r.error.startsWith("Foxtrot 404")) return { data: null }
    return r
  }
  return { data: r.data ?? null }
}

export async function getRouteWaypoints(
  dcId: string,
  routeId: string
): Promise<FoxtrotResult<FoxtrotWaypoint[]>> {
  const r = await request<{ waypoints: FoxtrotWaypoint[] } | FoxtrotWaypoint[]>(
    `/dcs/${dcId}/routes/${routeId}/waypoints`
  )
  if ("error" in r) return r
  const data = r.data as unknown
  if (Array.isArray(data)) return { data: data as FoxtrotWaypoint[] }
  if (data && typeof data === "object") {
    const obj = data as { waypoints?: FoxtrotWaypoint[] }
    if (Array.isArray(obj.waypoints)) return { data: obj.waypoints }
  }
  return { data: [] }
}

export async function getWaypointDeliveries(
  dcId: string,
  routeId: string,
  waypointId: string
): Promise<FoxtrotResult<FoxtrotDelivery[]>> {
  const r = await request<{ deliveries: FoxtrotDelivery[] } | FoxtrotDelivery[]>(
    `/dcs/${dcId}/routes/${routeId}/waypoints/${waypointId}/deliveries`
  )
  if ("error" in r) return r
  const data = r.data as unknown
  if (Array.isArray(data)) return { data: data as FoxtrotDelivery[] }
  if (data && typeof data === "object") {
    const obj = data as { deliveries?: FoxtrotDelivery[] }
    if (Array.isArray(obj.deliveries)) return { data: obj.deliveries }
  }
  return { data: [] }
}

export function isFoxtrotConfigured(): boolean {
  return getApiKey() !== null
}

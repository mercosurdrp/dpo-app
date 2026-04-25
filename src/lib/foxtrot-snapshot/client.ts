const FOXTROT_BASE = "https://apiv1.foxtrotsystems.com"
const DEFAULT_TTL_MS = 60_000
const CUSTOMER_TTL_MS = 60 * 60_000
const DRIVER_LOC_TTL_MS = 30_000

interface CacheEntry {
  ts: number
  data: unknown
  ttl: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

function getKey(): string {
  const k = process.env.FOXTROT_API_KEY
  if (!k) throw new Error("FOXTROT_API_KEY no configurada")
  return k
}

export async function fxFetch<T = unknown>(
  path: string,
  opts: { ttl?: number } = {},
): Promise<T> {
  const ttl = opts.ttl ?? DEFAULT_TTL_MS
  const now = Date.now()
  const hit = cache.get(path)
  if (hit && now - hit.ts < hit.ttl) return hit.data as T

  const pending = inflight.get(path)
  if (pending) return pending as Promise<T>

  const promise = (async () => {
    try {
      const res = await fetch(`${FOXTROT_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${getKey()}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        const empty = {} as T
        cache.set(path, { ts: now, data: empty, ttl })
        return empty
      }
      const json = (await res.json()) as T
      cache.set(path, { ts: now, data: json, ttl })
      return json
    } catch {
      const empty = {} as T
      cache.set(path, { ts: now, data: empty, ttl: 5_000 })
      return empty
    } finally {
      inflight.delete(path)
    }
  })()

  inflight.set(path, promise)
  return promise
}

export async function fxPostJson<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  try {
    const res = await fetch(`${FOXTROT_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return {} as T
    return (await res.json()) as T
  } catch {
    return {} as T
  }
}

interface DriversResponse {
  data?: { drivers?: { id: string; name?: string }[] }
}

export async function getDrivers(dcId: string): Promise<Map<string, string>> {
  const res = await fxFetch<DriversResponse>(`/dcs/${dcId}/drivers`, { ttl: 5 * 60_000 })
  const map = new Map<string, string>()
  for (const d of res.data?.drivers ?? []) {
    map.set(d.id, d.name ?? d.id)
  }
  return map
}

interface DriverLocResponse {
  data?: {
    driver_location?: {
      location?: { latitude?: number; longitude?: number }
      timestamp?: number | string
    }
  }
}

export async function getDriverLocation(
  dcId: string,
  driverId: string,
): Promise<{ lat: number; lng: number; ts_ms: number } | null> {
  const res = await fxFetch<DriverLocResponse>(
    `/dcs/${dcId}/drivers/${driverId}/location`,
    { ttl: DRIVER_LOC_TTL_MS },
  )
  const dl = res.data?.driver_location
  const lat = dl?.location?.latitude
  const lng = dl?.location?.longitude
  if (lat == null || lng == null) return null
  return { lat, lng, ts_ms: toMs(dl?.timestamp) }
}

interface RouteRaw {
  id: string
  name?: string
  assigned_driver_id?: string
  start_time?: number
  started_timestamp?: string | null
  finalized_timestamp?: string | null
  is_active?: boolean
  is_finalized?: boolean
  _date?: string
  _dc?: string
  _detail?: { waypoints: Waypoint[] }
}

interface RoutesByDateResponse {
  data?: { routes?: ({ data?: { route?: RouteRaw } } | RouteRaw)[] }
}

export async function getRoutesForDc(
  dcId: string,
  dates: string[],
): Promise<RouteRaw[]> {
  const all: RouteRaw[] = []
  await Promise.all(
    dates.map(async (d) => {
      const res = await fxFetch<RoutesByDateResponse>(
        `/dcs/${dcId}/routes/find_by_date/${d}`,
      )
      const routes = res.data?.routes ?? []
      for (const r of routes) {
        const rd = (r as { data?: { route?: RouteRaw } }).data?.route ?? (r as RouteRaw)
        if (!rd?.id) continue
        rd._date = d
        rd._dc = dcId
        all.push(rd)
      }
    }),
  )
  return all
}

interface Attempt {
  attempt_status?: "SUCCESSFUL" | "FAILED" | "VISIT_LATER"
  timestamp?: number | string
  attempt_timestamp?: number | string
  delivery_code?: string | null
  delivery_message?: string | null
  driver_notes?: string | null
}

interface Delivery {
  id?: string
  name?: string
  quantity?: number
  attempts?: Attempt[]
}

interface Waypoint {
  waypoint_id?: string
  id?: string
  customer_id?: string
  status?: string
  completed_timestamp?: number | null
  deliveries?: Delivery[]
}

interface WaypointsResponse {
  data?: { waypoints?: Waypoint[] }
}
interface DeliveriesResponse {
  data?: { deliveries?: Delivery[] }
}

export async function getRouteDetail(
  dcId: string,
  routeId: string,
): Promise<{ waypoints: Waypoint[] }> {
  const wpRes = await fxFetch<WaypointsResponse>(
    `/dcs/${dcId}/routes/${routeId}/waypoints`,
  )
  const waypoints = wpRes.data?.waypoints ?? []
  await Promise.all(
    waypoints.map(async (wp) => {
      const wpid = wp.waypoint_id ?? wp.id
      if (!wpid) return
      const dRes = await fxFetch<DeliveriesResponse>(
        `/dcs/${dcId}/routes/${routeId}/waypoints/${wpid}/deliveries`,
      )
      wp.deliveries = dRes.data?.deliveries ?? []
    }),
  )
  return { waypoints }
}

interface CustomerResponse {
  data?: {
    customer?: {
      name?: string
      inferred_location?: { latitude?: number; longitude?: number }
      imported_location?: { latitude?: number; longitude?: number }
    }
  }
}

export async function getCustomerMeta(
  dcId: string,
  customerId: string,
): Promise<{ name: string; loc: [number, number] | null }> {
  const res = await fxFetch<CustomerResponse>(
    `/dcs/${dcId}/customers/${customerId}`,
    { ttl: CUSTOMER_TTL_MS },
  )
  const c = res.data?.customer ?? {}
  let loc: [number, number] | null = null
  for (const key of ["inferred_location", "imported_location"] as const) {
    const l = c[key]
    if (l?.latitude && l?.longitude) {
      loc = [l.latitude, l.longitude]
      break
    }
  }
  return { name: c.name ?? "", loc }
}

export type { RouteRaw, Waypoint, Delivery, Attempt }

export function toMs(v: unknown): number {
  if (v == null) return 0
  if (typeof v === "number") return v > 1e12 ? Math.floor(v) : Math.floor(v) * 1000
  if (typeof v === "string") {
    try {
      const dt = new Date(v.replace("Z", "+00:00"))
      const t = dt.getTime()
      if (!Number.isNaN(t)) return t
    } catch {}
  }
  return 0
}

export function toFloat(v: unknown): number {
  if (v == null || v === "") return 0
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

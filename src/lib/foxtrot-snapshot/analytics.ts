import { fxFetch, fxPostJson, toFloat } from "./client"

const ANALYTICS_TTL = 30 * 60_000

interface RouteAnalytics {
  driven_m: number
  planned_m: number
  auth_stops_sec: number
  visited_customers: number
}

interface AnalyticsCacheEntry {
  txid?: string
  status: "pending" | "ready" | "error"
  by_route_id: Record<string, RouteAnalytics>
  total_driven_m: number
  total_planned_m: number
  expires: number
}

const analyticsCache = new Map<string, AnalyticsCacheEntry>()

interface DownloadRequestResponse {
  data?: { download_request_txid?: string }
}

interface DownloadFilesResponse {
  status?: string
  data?: {
    download_request_files?: { file_type?: string; download_link?: string }[]
  }
}

export async function getAnalyticsKm(
  dcs: string[],
  dates: string[],
): Promise<{
  status: "pending" | "ready" | "error"
  by_route_id: Record<string, RouteAnalytics>
  total_driven_m: number
  total_planned_m: number
}> {
  if (dates.length === 0) {
    return { status: "error", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
  }
  const sortedDcs = [...dcs].sort()
  const key = `${sortedDcs.join(",")}|${dates[dates.length - 1]}|${dates[0]}`
  const now = Date.now()
  let entry = analyticsCache.get(key)

  if (entry && entry.status === "ready" && entry.expires > now) {
    return {
      status: "ready",
      by_route_id: entry.by_route_id,
      total_driven_m: entry.total_driven_m,
      total_planned_m: entry.total_planned_m,
    }
  }

  if (!entry || entry.expires < now) {
    const fromDateRaw = dates[dates.length - 1]
    const toDateRaw = dates[0]
    let fromDate = fromDateRaw
    const toDate = toDateRaw
    const diffDays = Math.round(
      (new Date(`${toDate}T00:00:00Z`).getTime() -
        new Date(`${fromDate}T00:00:00Z`).getTime()) /
        86_400_000,
    )
    if (diffDays < 2) {
      const d = new Date(`${toDate}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 3)
      fromDate = d.toISOString().slice(0, 10)
    }
    const res = await fxPostJson<DownloadRequestResponse>("/analytics/download-requests", {
      dc_ids: sortedDcs,
      from_date: fromDate,
      to_date: toDate,
      analytics_types: ["ROUTE_ANALYTICS"],
    })
    const txid = res.data?.download_request_txid
    if (!txid) {
      return { status: "error", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
    }
    entry = {
      txid,
      status: "pending",
      by_route_id: {},
      total_driven_m: 0,
      total_planned_m: 0,
      expires: now + ANALYTICS_TTL,
    }
    analyticsCache.set(key, entry)
  }

  const txid = entry.txid
  if (!txid) {
    return { status: "error", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
  }
  const filesRes = await fxFetch<DownloadFilesResponse>(
    `/analytics/download-requests/${txid}/files`,
    { ttl: 5_000 },
  )
  if (filesRes.status !== "success") {
    entry.status = "pending"
    return { status: "pending", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
  }

  const files = filesRes.data?.download_request_files ?? []
  const csvLink = files.find((f) => f.file_type === "CSV")?.download_link
  if (!csvLink) {
    return { status: "error", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
  }

  let csvText: string
  try {
    const r = await fetch(csvLink, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) {
      return { status: "error", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
    }
    csvText = await r.text()
  } catch {
    return { status: "error", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
  }

  const byRouteId: Record<string, RouteAnalytics> = {}
  let totalDriven = 0
  let totalPlanned = 0
  const lines = csvText.split(/\r?\n/)
  if (lines.length === 0) {
    entry.status = "ready"
    entry.expires = now + ANALYTICS_TTL
    return { status: "ready", by_route_id: {}, total_driven_m: 0, total_planned_m: 0 }
  }
  const header = parseCsvLine(lines[0])
  const idxRouteId = header.findIndex((h) => h === "Route ID" || h === "route_id")
  const idxDriven = header.indexOf("Total Driven Meters")
  const idxPlanned = header.indexOf("Planned Foxtrot Driving Meters")
  const idxAuth = header.indexOf("Total Authorized Stops Seconds")
  const idxVisited = header.indexOf("Total Visited Customers Count")

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i])
    if (row.length === 0) continue
    const rid = row[idxRouteId]
    if (!rid) continue
    const driven = toFloat(row[idxDriven])
    const planned = toFloat(row[idxPlanned])
    const authStops = toFloat(row[idxAuth])
    const visited = toFloat(row[idxVisited])
    byRouteId[rid] = {
      driven_m: driven,
      planned_m: planned,
      auth_stops_sec: authStops,
      visited_customers: visited,
    }
    totalDriven += driven
    totalPlanned += planned
  }

  entry.status = "ready"
  entry.by_route_id = byRouteId
  entry.total_driven_m = totalDriven
  entry.total_planned_m = totalPlanned
  entry.expires = now + ANALYTICS_TTL

  return {
    status: "ready",
    by_route_id: byRouteId,
    total_driven_m: totalDriven,
    total_planned_m: totalPlanned,
  }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (ch === "," && !inQuote) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export type { RouteAnalytics }

/**
 * Sincronización del "Actual Route Departure Time" de Foxtrot.
 *
 * Ese dato — la salida REAL del vehículo del depósito — no viene en el objeto
 * de ruta (`getRoute`/`find_by_date`), sólo en el CSV de ROUTE_ANALYTICS, que
 * Foxtrot genera de forma asíncrona y recién después de que la ruta terminó.
 *
 * El indicador TML lo usa como fin del cálculo (liberación del vehículo). Acá
 * se descarga el CSV y se mergea la salida real en `foxtrot_routes.raw_data`
 * bajo la clave `tml_actual_departure` (ISO UTC), sin necesidad de DDL.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const FOXTROT_BASE = "https://apiv1.foxtrotsystems.com"
// Argentina no aplica horario de verano: offset fijo UTC-3.
const AR_OFFSET = "-03:00"

function apiKey(): string {
  return process.env.FOXTROT_API_KEY ?? ""
}

function dcIds(): string[] {
  return (process.env.FOXTROT_DC_IDS ?? "eldorado,iguazu")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fxJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data?: T; status?: string }> {
  const res = await fetch(FOXTROT_BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Foxtrot ${res.status} en ${path}`)
  return res.json()
}

// Parser de una línea CSV con soporte de comillas.
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

// "2026-04-02 07:19:29" (hora local del DC, AR) → ISO UTC.
function arLocalToIso(raw: string): string | null {
  const v = (raw ?? "").trim()
  if (!v) return null
  const norm = v.replace(" ", "T")
  const d = new Date(`${norm}${AR_OFFSET}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface AnalyticsResult {
  ok: boolean
  rutas_actualizadas: number
  rutas_sin_departure: number
  error?: string
}

/**
 * Descarga ROUTE_ANALYTICS para [fromDate, toDate] y guarda el departure real
 * en `foxtrot_routes.raw_data.tml_actual_departure`.
 */
export async function syncFoxtrotRouteAnalytics(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
): Promise<AnalyticsResult> {
  if (!apiKey()) {
    return { ok: false, rutas_actualizadas: 0, rutas_sin_departure: 0, error: "FOXTROT_API_KEY ausente" }
  }
  try {
    // 1) Pedir la generación del CSV.
    const req = await fxJson<{ download_request_txid?: string }>(
      "/analytics/download-requests",
      {
        method: "POST",
        body: JSON.stringify({
          dc_ids: dcIds(),
          from_date: fromDate,
          to_date: toDate,
          analytics_types: ["ROUTE_ANALYTICS"],
        }),
      },
    )
    const txid = req.data?.download_request_txid
    if (!txid) {
      return { ok: false, rutas_actualizadas: 0, rutas_sin_departure: 0, error: "sin txid" }
    }

    // 2) Poll hasta que el archivo esté listo (asíncrono).
    let csvLink: string | null = null
    for (let i = 0; i < 25; i++) {
      await sleep(3000)
      const files = await fxJson<{
        download_request_files?: { file_type?: string; download_link?: string }[]
      }>(`/analytics/download-requests/${txid}/files`)
      const csv = files.data?.download_request_files?.find((f) => f.file_type === "CSV")
      if (csv?.download_link) {
        csvLink = csv.download_link
        break
      }
    }
    if (!csvLink) {
      return { ok: false, rutas_actualizadas: 0, rutas_sin_departure: 0, error: "CSV no disponible (timeout)" }
    }

    // 3) Descargar y parsear el CSV.
    const csvRes = await fetch(csvLink, { signal: AbortSignal.timeout(60000) })
    if (!csvRes.ok) {
      return { ok: false, rutas_actualizadas: 0, rutas_sin_departure: 0, error: `descarga CSV ${csvRes.status}` }
    }
    const lines = (await csvRes.text()).split(/\r?\n/)
    if (lines.length < 2) {
      return { ok: true, rutas_actualizadas: 0, rutas_sin_departure: 0 }
    }
    const header = parseCsvLine(lines[0])
    const idxRoute = header.indexOf("Route ID")
    const idxDep = header.indexOf("Actual Route Departure Time")
    if (idxRoute < 0 || idxDep < 0) {
      return { ok: false, rutas_actualizadas: 0, rutas_sin_departure: 0, error: "columnas faltantes en CSV" }
    }

    const departureByRoute = new Map<string, string>()
    let sinDeparture = 0
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i])
      const routeId = row[idxRoute]
      if (!routeId) continue
      const iso = arLocalToIso(row[idxDep])
      if (iso) departureByRoute.set(routeId, iso)
      else sinDeparture++
    }
    if (departureByRoute.size === 0) {
      return { ok: true, rutas_actualizadas: 0, rutas_sin_departure: sinDeparture }
    }

    // 4) Mergear en raw_data de las filas existentes de foxtrot_routes.
    const PAGE = 1000
    const existentes: {
      route_id: string
      dc_id: string
      fecha: string
      driver_id: string
      driver_name: string
      raw_data: Record<string, unknown> | null
    }[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("foxtrot_routes")
        .select("route_id,dc_id,fecha,driver_id,driver_name,raw_data")
        .gte("fecha", fromDate)
        .lte("fecha", toDate)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`select foxtrot_routes: ${error.message}`)
      existentes.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }

    const updates = existentes
      .filter((r) => departureByRoute.has(r.route_id))
      .map((r) => ({
        route_id: r.route_id,
        dc_id: r.dc_id,
        fecha: r.fecha,
        driver_id: r.driver_id,
        driver_name: r.driver_name,
        raw_data: {
          ...(r.raw_data ?? {}),
          tml_actual_departure: departureByRoute.get(r.route_id),
        },
      }))

    for (let i = 0; i < updates.length; i += 500) {
      const { error } = await supabase
        .from("foxtrot_routes")
        .upsert(updates.slice(i, i + 500), { onConflict: "route_id" })
      if (error) throw new Error(`upsert foxtrot_routes: ${error.message}`)
    }

    return {
      ok: true,
      rutas_actualizadas: updates.length,
      rutas_sin_departure: sinDeparture,
    }
  } catch (e) {
    return {
      ok: false,
      rutas_actualizadas: 0,
      rutas_sin_departure: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

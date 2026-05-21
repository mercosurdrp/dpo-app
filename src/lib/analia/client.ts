/**
 * Cliente del dashboard de depósito de Analía (perdidas-deposito.vercel.app).
 *
 * Los endpoints son públicos (el proyecto no tiene DASHBOARD_USER/PASS
 * configuradas → sin Basic auth). Solo se consume por GET.
 *
 * Fuente para los KPIs de depósito en la reunión de logística de Misiones.
 * Tolerante a fallos: si Analía cae, devuelve {} y los indicadores quedan
 * vacíos sin romper el resto del tablero.
 *
 * Fase 2 pendiente: Pérdidas (valorizado + HL por categoría) — requiere una
 * serie diaria con HL que Analía hoy no expone.
 */

const ANALIA_BASE =
  process.env.ANALIA_BASE_URL ?? "https://perdidas-deposito.vercel.app"
const TTL_MS = 5 * 60 * 1000
const TIMEOUT_MS = 8000

type CacheEntry = { value: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>()

async function fetchJson<T>(path: string): Promise<T | null> {
  const url = `${ANALIA_BASE}${path}`
  const hit = cache.get(url)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const json = (await res.json()) as T
    cache.set(url, { value: json, expiresAt: Date.now() + TTL_MS })
    return json
  } catch {
    return null
  }
}

interface ErroresPorFecha {
  fecha: string
  picking: number
  descarga: number
  total: number
}
interface ErroresResponse {
  por_fecha?: ErroresPorFecha[]
}

/**
 * Cantidad de errores operativos (picking + descarga) por fecha YYYY-MM-DD.
 * Devuelve {} si Analía no responde.
 */
export async function getErroresPorFecha(): Promise<Record<string, number>> {
  const data = await fetchJson<ErroresResponse>("/api/errores-operativos")
  const out: Record<string, number> = {}
  for (const r of data?.por_fecha ?? []) {
    if (r.fecha) out[r.fecha] = r.total ?? 0
  }
  return out
}

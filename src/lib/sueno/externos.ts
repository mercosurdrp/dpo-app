/**
 * KPIs del árbol del Sueño cuya fuente vive FUERA de dpo-app (en
 * deposito-esteban / WMS). En vez de la RPC `sueno_kpi_detalle`, su valor
 * anual y su detalle mensual se traen por API del depósito.
 *
 * Hoy: `prod_picking` (Bul/HH) ← /api/productividad/picking-resumen.
 *
 * Patrón calcado de `warehouse/auto-indicadores.ts`: fetch con timeout corto,
 * cache in-memory por proceso (1h) y tolerancia total a fallos (si el depósito
 * no responde, el caller cae al valor persistido en la tabla / al detalle vacío).
 */

const DEPOSITO_API_BASE =
  process.env.DEPOSITO_API_URL ?? "https://deposito-esteban.vercel.app"

const TIMEOUT_MS = 5000
const TTL_MS = 60 * 60 * 1000 // 1h: el blob del WMS se regenera 1 vez al día

export interface PickingResumenMes {
  mes: number
  valor: number | null
  registros: number
}
export interface PickingResumen {
  anio: number
  promedio_anual: number | null
  registros_anual: number
  generado_en: string | null
  meses: PickingResumenMes[]
}

/** key del KPI → cómo resolver su valor externo. */
export const KPI_EXTERNOS: Record<
  string,
  {
    /** Trae el resumen anual+mensual del depósito (o null si no disponible). */
    resumen: (anio: number) => Promise<PickingResumen | null>
    /** Texto del popover. */
    explicacion: string
  }
> = {
  prod_picking: {
    resumen: fetchPickingResumen,
    explicacion:
      "Prod Picking = bultos por hora-hombre (Bul/HH) del WMS. El número es el " +
      "promedio anual de los registros operario×día; el detalle muestra el " +
      "promedio de cada mes y cuántos registros lo componen. Fuente: depósito " +
      "(deposito-esteban /productividad).",
  },
}

export function esKpiExterno(key: string): boolean {
  return key in KPI_EXTERNOS
}

const cache = new Map<string, { value: unknown; expiresAt: number }>()

async function fetchJsonCached<T>(url: string): Promise<T | null> {
  const hit = cache.get(url)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T | null
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as T
    cache.set(url, { value: data, expiresAt: Date.now() + TTL_MS })
    return data
  } catch {
    return null
  }
}

async function fetchPickingResumen(anio: number): Promise<PickingResumen | null> {
  return fetchJsonCached<PickingResumen>(
    `${DEPOSITO_API_BASE}/api/productividad/picking-resumen?anio=${anio}`,
  )
}

/**
 * Resuelve el valor anual (para la card) de todos los KPIs externos del año.
 * Devuelve un mapa key → valor (o null si el depósito no respondió). Nunca
 * lanza: cada externo se resuelve por separado.
 */
export async function resolverValoresExternos(
  anio: number,
): Promise<Map<string, number | null>> {
  const entries = Object.entries(KPI_EXTERNOS)
  const out = new Map<string, number | null>()
  await Promise.all(
    entries.map(async ([key, cfg]) => {
      const r = await cfg.resumen(anio)
      out.set(key, r?.promedio_anual ?? null)
    }),
  )
  return out
}

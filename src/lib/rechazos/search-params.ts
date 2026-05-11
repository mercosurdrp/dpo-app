/**
 * Parser único de search params del dashboard de rechazos.
 *
 * Se invoca server-side en `page.tsx` (sin dep externa: parsing manual).
 * Las fechas default ("hoy", "primer día del mes") se calculan en
 * America/Argentina/Buenos_Aires — Vercel corre en UTC y un new Date()
 * directo da el mes siguiente entre 21:00 y 23:59 ART.
 */

import type {
  ComparisonMode,
  RechazosComparadoRequest,
  RechazoCategoria,
  RechazosFilters,
} from "@/lib/types/rechazos"

const TZ = "America/Argentina/Buenos_Aires"
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/
const VALID_MODES: ReadonlySet<ComparisonMode> = new Set(["mes_en_curso", "mes_cerrado", "rango_custom"])
const VALID_CATEGORIAS: ReadonlySet<RechazoCategoria> = new Set(["Logística", "Ventas", "Cliente", "Interno", "Externo", "POR_CLASIFICAR"])

type Raw = Record<string, string | string[] | undefined>

export function parseRechazosSearchParams(raw: Raw): RechazosComparadoRequest {
  const desde = pickDate(raw.desde) ?? firstOfMonthInART()
  const hasta = pickDate(raw.hasta) ?? todayInART()
  const mode = pickMode(raw.mode)
  const filters = pickFilters(raw)
  return { desde, hasta, mode, filters }
}

export function todayInART(): string {
  return formatYMD_AR(new Date())
}

export function firstOfMonthInART(): string {
  return todayInART().slice(0, 8) + "01"
}

function formatYMD_AR(d: Date): string {
  // en-CA con 2-digit produce YYYY-MM-DD nativo.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function pickDate(v: string | string[] | undefined): string | null {
  const s = first(v)
  return s && DATE_RX.test(s) ? s : null
}

function pickMode(v: string | string[] | undefined): ComparisonMode | undefined {
  const s = first(v)
  return s && VALID_MODES.has(s as ComparisonMode) ? (s as ComparisonMode) : undefined
}

function pickFilters(raw: Raw): RechazosFilters | undefined {
  const ds_fletero_carga = parseCsvStrings(raw.fleteros)
  const id_rechazo = parseCsvNumbers(raw.motivos)
  const id_cliente = parseCsvNumbers(raw.clientes)
  const id_articulo = parseCsvNumbers(raw.productos)
  const ds_canal_mkt = parseCsvStrings(raw.canales)
  const ds_supervisor = parseCsvStrings(raw.supervisores)
  const categoria = parseCsvCategorias(raw.categorias)
  const f: RechazosFilters = {
    ...(ds_fletero_carga && { ds_fletero_carga }),
    ...(id_rechazo && { id_rechazo }),
    ...(id_cliente && { id_cliente }),
    ...(id_articulo && { id_articulo }),
    ...(ds_canal_mkt && { ds_canal_mkt }),
    ...(ds_supervisor && { ds_supervisor }),
    ...(categoria && { categoria }),
  }
  return Object.keys(f).length > 0 ? f : undefined
}

function first(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}

function parseCsvStrings(v: string | string[] | undefined): string[] | undefined {
  const s = first(v)
  if (!s) return undefined
  const out = s.split(",").map(x => x.trim()).filter(Boolean)
  return out.length ? out : undefined
}

function parseCsvNumbers(v: string | string[] | undefined): number[] | undefined {
  const s = first(v)
  if (!s) return undefined
  const out = s.split(",").map(x => Number(x.trim())).filter(n => Number.isFinite(n))
  return out.length ? out : undefined
}

function parseCsvCategorias(v: string | string[] | undefined): RechazoCategoria[] | undefined {
  const arr = parseCsvStrings(v)
  if (!arr) return undefined
  const out = arr.filter((s): s is RechazoCategoria => VALID_CATEGORIAS.has(s as RechazoCategoria))
  return out.length ? out : undefined
}

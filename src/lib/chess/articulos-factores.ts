/**
 * Maestro de factores de artículos desde Chess, para cajas equivalentes (CEq)
 * y hectolitros (HL) en la reunión de logística de Misiones.
 *
 *   CEq_SKU = 120 × bultos / bultosPallet
 *   HL_SKU  = valorUnidadMedida × bultos      (valorUnidadMedida = HL por bulto)
 *
 * El cruce con Foxtrot es por nombre normalizado (delivery_name ↔ desArticulo):
 * Foxtrot no expone el idArticulo de Chess. Match medido = 99,4% (169/170).
 *
 * El catálogo (~1.200 artículos) se cachea en memoria 6h: cambia poco y evita
 * pegarle a Chess (lento) en cada apertura del tablero. Si Chess falla, se
 * devuelve null y los indicadores CEq/HL/OB/TLP quedan vacíos sin romper el resto.
 */

import https from "node:https"
import { chessLogin, type ChessCredentials } from "@/lib/wa-bot/chess"

export interface ArticuloFactor {
  bultosPallet: number
  valorUM: number
  esEnvase: boolean
}

/** Map keyed por nombre normalizado (= normNombre(desArticulo)). */
export type FactoresMap = Map<string, ArticuloFactor>

interface ChessArticuloFull {
  idArticulo: number
  desArticulo?: string | null
  bultosPallet?: number | null
  valorUnidadMedida?: number | null
  eAgrupaciones?: { idFormaAgrupar?: string; desAgrupacion?: string }[]
}

const insecureAgent = new https.Agent({ rejectUnauthorized: false })

/** Normalización compartida con el cálculo: upper + trim + colapsar espacios. */
export function normNombre(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, " ")
}

function tipoProducto(a: ChessArticuloFull): string {
  for (const g of a.eAgrupaciones ?? []) {
    if (g.idFormaAgrupar === "TIPO DE PRODUCTO") return g.desAgrupacion ?? ""
  }
  return ""
}

async function fetchFactores(
  creds: ChessCredentials,
  sessionId: string,
): Promise<FactoresMap> {
  const out: FactoresMap = new Map()
  let nroLote = 1
  const MAX_LOTES = 200
  while (nroLote <= MAX_LOTES) {
    const url = `${creds.baseUrl}/articulos/?nroLote=${nroLote}`
    const r = await fetch(url, {
      headers: { Accept: "application/json", Cookie: sessionId },
      // @ts-expect-error Node fetch supports agent option
      agent: insecureAgent,
    })
    if (!r.ok) throw new Error(`Chess GET /articulos lote=${nroLote}: ${r.status}`)
    const d = (await r.json()) as {
      Articulos?: { eArticulos?: ChessArticuloFull[] }
    }
    const batch = d?.Articulos?.eArticulos ?? []
    if (batch.length === 0) break
    for (const a of batch) {
      const key = normNombre(a.desArticulo)
      if (!key) continue
      out.set(key, {
        bultosPallet: Number(a.bultosPallet ?? 0),
        valorUM: Number(a.valorUnidadMedida ?? 0),
        esEnvase: tipoProducto(a) === "ENVASE",
      })
    }
    nroLote += 1
  }
  return out
}

// ─── Cache en memoria (por proceso) ──────────────────────────────────────────

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
let cache: { value: FactoresMap; expiresAt: number } | null = null

/**
 * Devuelve el maestro de factores (cacheado 6h). null si faltan credenciales
 * o Chess falla — el caller debe degradar a indicadores vacíos.
 */
export async function getArticulosFactores(): Promise<FactoresMap | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  const baseUrl = process.env.CHESS_API_BASE_URL
  const user = process.env.CHESS_API_USER
  const pass = process.env.CHESS_API_PASS
  if (!baseUrl || !user || !pass) return null

  try {
    const creds: ChessCredentials = { baseUrl, user, pass }
    const sessionId = await chessLogin(creds)
    const value = await fetchFactores(creds, sessionId)
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
    return value
  } catch {
    return null
  }
}

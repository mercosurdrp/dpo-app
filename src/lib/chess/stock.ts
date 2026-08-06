/**
 * Stock por artículo desde Chess — `GET /stock/?fechaStock=DD/MM/YYYY&idDeposito=N`.
 *
 * Es la fuente del indicador de Quiebres de Stock (Indicadores · Almacén).
 *
 * Notas de la API (verificadas contra prod 2026-08-06):
 * - 🚨 La fecha va en **DD/MM/YYYY**, no en ISO. Con `YYYY-MM-DD` responde
 *   "Parametros mal expresados"; con cualquier otro nombre de parámetro
 *   (`fecha`, `fechaDesde`, `fechaProceso`) responde "Debe Ingresar una fecha
 *   de stock valida". El único nombre que reconoce es `fechaStock`.
 * - `idDeposito` es obligatorio (con 0 pide que se indique uno). El depósito 1
 *   es el CD con el catálogo completo (~758 artículos); los depósitos 2 a 5
 *   tienen catálogos chicos (30-125 artículos).
 * - **Los artículos sin stock VIENEN igual, con `cantBultos: 0`.** No hay que
 *   inferir el quiebre por ausencia de fila: el cero es explícito. Un día
 *   cualquiera, cerca de la mitad del catálogo está en cero.
 * - **Acepta fechas pasadas**: devuelve la foto del stock a esa fecha. Probado
 *   hasta junio 2025. Por eso los meses anteriores se pueden reconstruir en
 *   vez de estimarlos por ausencia de venta.
 * - Devuelve `dsStockFisicoApi`, o sea stock FÍSICO. Chess no expone un
 *   endpoint de disponible; el disponible sólo se podría aproximar hacia
 *   adelante restando pedidos pendientes, y entonces los meses dejarían de ser
 *   comparables entre sí. Para un indicador que define un variable, la
 *   definición tiene que ser la misma todos los meses: se usa el físico.
 * - El certificado del server no valida: hay que pegarle con un agent
 *   permisivo, igual que el resto de las integraciones Chess del repo.
 */
import https from "node:https"
import { chessLogin, type ChessCredentials } from "@/lib/wa-bot/chess"

const insecureAgent = new https.Agent({ rejectUnauthorized: false })

function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error Node fetch soporta la opción agent
    agent: insecureAgent,
  })
}

/** Depósito del CD: el único con el catálogo completo. */
export const DEPOSITO_CD = 1

export interface StockChessFila {
  fecha: string
  idDeposito: number
  idAlmacen: number
  idArticulo: number
  dsArticulo: string
  fecVtoLote: string | null
  cantBultos: number
  cantUnidades: number
}

export function credencialesChess(): ChessCredentials {
  const baseUrl = process.env.CHESS_API_BASE_URL
  const user = process.env.CHESS_API_USER
  const pass = process.env.CHESS_API_PASS
  if (!baseUrl || !user || !pass) {
    throw new Error("Faltan credenciales de Chess (CHESS_API_BASE_URL / USER / PASS)")
  }
  return { baseUrl, user, pass }
}

/** YYYY-MM-DD → DD/MM/YYYY, que es lo único que acepta el endpoint. */
export function aFechaChess(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

/**
 * Foto del stock de un día. `fechaIso` en YYYY-MM-DD.
 * Devuelve una fila por artículo (incluidos los que están en cero).
 */
export async function getStockChess(
  fechaIso: string,
  opts: { idDeposito?: number; sessionId?: string } = {},
): Promise<StockChessFila[]> {
  const creds = credencialesChess()
  const sessionId = opts.sessionId ?? (await chessLogin(creds))
  const idDeposito = opts.idDeposito ?? DEPOSITO_CD

  const url = `${creds.baseUrl}/stock/?fechaStock=${encodeURIComponent(aFechaChess(fechaIso))}&idDeposito=${idDeposito}`
  const res = await chessFetch(url, {
    headers: { Accept: "application/json", Cookie: sessionId },
  })
  if (!res.ok) throw new Error(`Chess GET /stock ${fechaIso}: ${res.status}`)

  const raw = (await res.json()) as {
    dsStockFisicoApi?: Record<string, unknown>
    error?: { mensaje?: string }[]
  }
  const err = raw.error?.[0]?.mensaje
  const ds = raw.dsStockFisicoApi ?? {}
  const filas = Object.values(ds).find(Array.isArray) as StockChessFila[] | undefined

  if (!filas) {
    // Chess devuelve 200 con el dataset vacío y el motivo en `error`.
    throw new Error(`Chess /stock ${fechaIso}: ${err ?? "respuesta sin datos"}`)
  }
  return filas
}

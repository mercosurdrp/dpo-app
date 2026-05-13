/**
 * Cliente Chess para el bot de WhatsApp.
 * Reusa `chessLogin` del módulo de rechazos para no duplicar auth.
 */
import https from "node:https"

export interface ChessCredentials {
  baseUrl: string
  user: string
  pass: string
}

const insecureAgent = new https.Agent({ rejectUnauthorized: false })

function chessFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error Node fetch supports agent option
    agent: insecureAgent,
  })
}

// ─── Tipos crudos Chess ──────────────────────────────────────────────────────

export interface ChessPedidoItem {
  idArticulo: number
  cantBultos: number
  cantUnidades: number
  precioUnitario: number
  anulado: string                              // "false" | "true"
}

export interface ChessPedido {
  idCliente: number
  fechaEntrega: string                         // "YYYY-MM-DD"
  idDeposito?: number
  eliminado?: string                           // "false" | "true"
  items: ChessPedidoItem[]
}

export interface ChessClienteFuerza {
  idRuta: number
  idModoAtencion?: number
  anulado?: string
  fechaInicioFuerza?: string
}

export interface ChessCliente {
  idCliente: number
  calleEntrega?: string | null
  alturaEntrega?: string | number | null
  desLocalidad?: string | null
  longitudGeo?: number | null
  latitudGeo?: number | null
  desCanalMkt?: string | null
  eClialias?: { razonSocial?: string; anulado?: string; fechaHoraAlta?: string }[]
  eClifuerza?: ChessClienteFuerza[]
  telefono?: string | null
}

export interface ChessRutaVenta {
  idRuta: number
  desRuta?: string | null
  idPersonal: number                           // ← este es el promotor
  desPersonal?: string | null
}

export interface ChessArticulo {
  idArticulo: number
  desCortaArticulo?: string | null
  desArticulo?: string | null
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function chessLogin(creds: ChessCredentials): Promise<string> {
  const r = await chessFetch(`${creds.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: creds.user, password: creds.pass }),
  })
  if (!r.ok) throw new Error(`Chess login failed: ${r.status}`)
  const data = (await r.json()) as { sessionId?: string }
  if (!data.sessionId) throw new Error("No sessionId from Chess")
  return data.sessionId
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

/** Pedidos por fecha de entrega. */
export async function fetchPedidosByFechaEntrega(
  creds: ChessCredentials, sessionId: string, fecha: string,
): Promise<ChessPedido[]> {
  const url = `${creds.baseUrl}/pedidos/?fechaEntrega=${fecha}`
  const r = await chessFetch(url, {
    headers: { Accept: "application/json", Cookie: sessionId },
  })
  if (!r.ok) throw new Error(`Chess GET /pedidos ${fecha}: ${r.status}`)
  const d = (await r.json()) as { pedidos?: ChessPedido[] }
  return Array.isArray(d.pedidos) ? d.pedidos : []
}

/** Clientes paginados por nroLote. Acumula hasta que un lote vuelva vacío. */
export async function fetchAllClientes(
  creds: ChessCredentials, sessionId: string,
): Promise<ChessCliente[]> {
  const all: ChessCliente[] = []
  let nroLote = 1
  const MAX_LOTES = 200                          // safety
  while (nroLote <= MAX_LOTES) {
    const url = `${creds.baseUrl}/clientes/?anulado=false&nroLote=${nroLote}`
    const r = await chessFetch(url, {
      headers: { Accept: "application/json", Cookie: sessionId },
    })
    if (!r.ok) throw new Error(`Chess GET /clientes lote=${nroLote}: ${r.status}`)
    const d = (await r.json()) as { Clientes?: { eClientes?: ChessCliente[] } }
    const batch = d?.Clientes?.eClientes ?? []
    if (batch.length === 0) break
    all.push(...batch)
    nroLote += 1
  }
  return all
}

/** Maestro de rutas → personal (= promotor). */
export async function fetchRutasVenta(
  creds: ChessCredentials, sessionId: string,
): Promise<ChessRutaVenta[]> {
  const url = `${creds.baseUrl}/rutasVenta/?anulada=false`
  const r = await chessFetch(url, {
    headers: { Accept: "application/json", Cookie: sessionId },
  })
  if (!r.ok) throw new Error(`Chess GET /rutasVenta: ${r.status}`)
  const d = (await r.json()) as { RutasVenta?: { eRutasVenta?: ChessRutaVenta[] } }
  return d?.RutasVenta?.eRutasVenta ?? []
}

/** Artículos paginados. Devuelve un Map idArticulo → descripción corta. */
export async function fetchArticulosMap(
  creds: ChessCredentials, sessionId: string,
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  let nroLote = 1
  const MAX_LOTES = 200
  while (nroLote <= MAX_LOTES) {
    const url = `${creds.baseUrl}/articulos/?nroLote=${nroLote}`
    const r = await chessFetch(url, {
      headers: { Accept: "application/json", Cookie: sessionId },
    })
    if (!r.ok) throw new Error(`Chess GET /articulos lote=${nroLote}: ${r.status}`)
    const d = (await r.json()) as { Articulos?: { eArticulos?: ChessArticulo[] } }
    const batch = d?.Articulos?.eArticulos ?? []
    if (batch.length === 0) break
    for (const a of batch) {
      const desc = a.desCortaArticulo ?? a.desArticulo ?? `Art ${a.idArticulo}`
      out.set(a.idArticulo, desc)
    }
    nroLote += 1
  }
  return out
}

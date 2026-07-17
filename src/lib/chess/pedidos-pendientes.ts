/**
 * Pedidos PENDIENTES de entrega, desde Chess (`GET /pedidos/?fechaEntrega=`).
 *
 * Notas de la API (verificadas contra prod 2026-07-14):
 * - Devuelve SOLO pedidos pendientes: una fecha ya facturada vuelve vacía.
 * - 🚨 `nroLote` es IGNORADO por este endpoint: paginar devuelve el MISMO lote una y
 *   otra vez (208 pedidos × 81 lotes = 16.848 duplicados). NO paginar acá. Igual
 *   deduplicamos por `idPedido` por las dudas.
 * - Al momento del corte el pedido todavía NO está ruteado: `Reparto` viene "PENDIENTE"
 *   para todos. La zona se aproxima por la localidad del cliente.
 */
import { chessLogin, type ChessCredentials } from "@/lib/wa-bot/chess"
import { getPool } from "@/lib/mercosur-dashboard"

export interface PedidoPendiente {
  id_cliente: number
  pedidos: number
  /** Σ bultos de los ítems no anulados. Es lo que OCUPA CUPO en el camión. */
  bultos: number
  /** Volumen en HECTOLITROS. Misma fórmula que el Volumen Reprogramado por crédito. */
  hl: number
  /** Σ cantBultos × precioUnitario (en Chess el precio es POR BULTO). */
  monto: number
  skus: number
}

interface ChessPedidoRaw {
  idPedido?: string
  idCliente: number
  eliminado?: boolean | string
  items?: {
    idArticulo?: number
    cantBultos?: number
    cantUnidades?: number
    precioUnitario?: number
    anulado?: boolean | string
  }[]
}

const esVerdad = (v: unknown) => v === true || v === "true"

function creds(): ChessCredentials {
  const baseUrl = process.env.CHESS_API_BASE_URL
  const user = process.env.CHESS_API_USER
  const pass = process.env.CHESS_API_PASS
  if (!baseUrl || !user || !pass) throw new Error("Faltan credenciales de Chess (CHESS_API_*)")
  return { baseUrl, user, pass }
}

/**
 * Maestro de artículos para convertir bultos → HL.
 * `valor_unidad_medida` = HL POR BULTO. Calibrado: art 7038 (0,12) × 350 bultos = 42 HL.
 */
export async function getMaestroArticulos(): Promise<Map<number, { vum: number; unidadesBulto: number }>> {
  const { rows } = await getPool().query<{ id_articulo: number; vum: string; ub: string }>(
    `select id_articulo, valor_unidad_medida vum, unidades_bulto ub
     from articulos where valor_unidad_medida is not null`,
  )
  return new Map(
    rows.map((r) => [
      Number(r.id_articulo),
      { vum: Number(r.vum), unidadesBulto: Number(r.ub) || 1 },
    ]),
  )
}

/**
 * Pedidos pendientes de `fechaEntrega` (YYYY-MM-DD) agregados POR CLIENTE, con bultos y HL.
 * Descarta pedidos eliminados e ítems anulados.
 */
export async function getPedidosPendientes(fechaEntrega: string): Promise<PedidoPendiente[]> {
  const c = creds()
  const [sessionId, articulos] = await Promise.all([chessLogin(c), getMaestroArticulos()])

  const r = await fetch(`${c.baseUrl}/pedidos/?fechaEntrega=${fechaEntrega}`, {
    headers: { Accept: "application/json", Cookie: sessionId },
  })
  if (!r.ok) throw new Error(`Chess GET /pedidos ${fechaEntrega}: ${r.status}`)
  const raw = (await r.json()) as { pedidos?: ChessPedidoRaw[] }
  const lista = Array.isArray(raw.pedidos) ? raw.pedidos : []

  const unicos = [...new Map(lista.map((p) => [p.idPedido ?? crypto.randomUUID(), p])).values()]
  const vivos = unicos.filter((p) => !esVerdad(p.eliminado))

  const acc = new Map<number, PedidoPendiente & { _skus: Set<number> }>()
  for (const p of vivos) {
    const items = (p.items ?? []).filter((i) => !esVerdad(i.anulado))
    let bultos = 0, hl = 0, monto = 0
    for (const i of items) {
      const cb = Number(i.cantBultos ?? 0)
      const cu = Number(i.cantUnidades ?? 0)
      bultos += cb
      monto += cb * Number(i.precioUnitario ?? 0)
      const a = i.idArticulo != null ? articulos.get(i.idArticulo) : undefined
      if (a) hl += cb * a.vum + cu * (a.vum / a.unidadesBulto)
    }
    const prev =
      acc.get(p.idCliente) ??
      { id_cliente: p.idCliente, pedidos: 0, bultos: 0, hl: 0, monto: 0, skus: 0, _skus: new Set<number>() }
    prev.pedidos += 1
    prev.bultos += bultos
    prev.hl += hl
    prev.monto += monto
    for (const i of items) if (i.idArticulo != null) prev._skus.add(i.idArticulo)
    acc.set(p.idCliente, prev)
  }

  return [...acc.values()]
    .map(({ _skus, ...rest }) => ({ ...rest, skus: _skus.size }))
    .filter((p) => p.bultos > 0)   // un pedido sin bultos no ocupa cupo
}

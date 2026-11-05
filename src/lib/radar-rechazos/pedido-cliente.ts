/**
 * Detalle del pedido de cada cliente crítico para el mensaje "listo para
 * copiar" que el vendedor le reenvía al cliente (pedido de Nicolás Lescoulie,
 * 2/11/2026: el promotor copia, pega y les manda la captura a los supervisores).
 *
 * Productos: de los ítems del pedido en Chess, sin la línea encabezado de los
 * combos (sus componentes vienen como líneas propias).
 * Total: ESTIMADO desde el pedido (5/11/2026: el aviso sale el día que se
 * carga el pedido, antes de la emisión, así que todavía no hay factura). Ver
 * `totalEstimadoPedido`: precio por bulto × bultos (las unidades sueltas como
 * fracción del bulto), menos la bonificación de la línea, sin el encabezado de
 * los combos, × 1,34 de IVA e impuestos internos. Calibrado contra lo
 * facturado del 04 y 05/11/2026 (613 clientes): factura ÷ estimado da 1,28 a
 * 1,38 con mediana 1,337. Antes se sumaba precioUnitario × cantUnidades, que
 * daba $0 en los pedidos por bulto y contaba los combos dos veces.
 */
import {
  chessFetch,
  chessLogin,
  fetchPedidosByFechaEntrega,
  type ChessCredentials,
} from "@/lib/wa-bot/chess"

export interface ProductoPedido {
  nombre: string
  cantidad: string // "2 cajones", "6 unidades", "1 bulto"
}

export interface DetallePedido {
  productos: ProductoPedido[]
  total: number | null // estimado con impuestos; null = sin precio en el pedido
  cajones_retornables: number // envases vacíos que tiene que tener listos
}

/**
 * Factura ÷ pedido (precio × cantidad − bonificación): IVA + impuestos
 * internos. Mediana 1,337 sobre 613 clientes facturados el 04 y 05/11/2026.
 */
export const FACTOR_IMPUESTOS_PEDIDO = 1.34

export interface ItemPedidoChess {
  idArticulo: number | string
  cantBultos?: number | string | null
  cantUnidades?: number | string | null
  precioUnitario?: number | string | null
  bonificacion?: number | string | null
  anulado?: boolean | string | null
}

export interface ArticuloChess {
  idArticulo: number
  desArticulo?: string | null
  desCortaArticulo?: string | null
  unidadesBulto?: number | null
  tieneRetornables?: boolean | string | null
  esCombo?: boolean | string | null
}

const si = (v: unknown) => v === true || String(v ?? "").toUpperCase() === "SI" || v === "true"

export async function fetchArticulos(creds: ChessCredentials, sessionId: string, ids: Set<number>) {
  const out = new Map<number, ArticuloChess>()
  for (let lote = 1; lote <= 200 && out.size < ids.size; lote++) {
    const r = await chessFetch(`${creds.baseUrl}/articulos/?nroLote=${lote}`, {
      headers: { Accept: "application/json", Cookie: sessionId },
    })
    if (!r.ok) throw new Error(`Chess GET /articulos lote=${lote}: ${r.status}`)
    const d = (await r.json()) as { Articulos?: { eArticulos?: ArticuloChess[] } }
    const batch = d?.Articulos?.eArticulos ?? []
    if (!batch.length) break
    for (const a of batch) if (ids.has(Number(a.idArticulo))) out.set(Number(a.idArticulo), a)
  }
  return out
}

/**
 * Total aproximado de un pedido, como lo va a ver el cliente en la factura.
 * `precioUnitario` en Chess es por BULTO: las unidades sueltas entran como
 * fracción del bulto (`unidadesBulto` del artículo). Las líneas anuladas y el
 * encabezado de los combos (repite la suma de sus componentes) no suman.
 */
export function totalEstimadoPedido(
  items: ItemPedidoChess[],
  arts: Map<number, ArticuloChess>,
): number {
  let neto = 0
  for (const it of items) {
    if (String(it.anulado) === "true") continue
    const a = arts.get(Number(it.idArticulo))
    if (si(a?.esCombo)) continue
    const porBulto = Number(a?.unidadesBulto) || 1
    const cant = (Number(it.cantBultos) || 0) + (Number(it.cantUnidades) || 0) / porBulto
    const bonif = Math.min(Math.max(Number(it.bonificacion) || 0, 0), 100)
    neto += cant * (Number(it.precioUnitario) || 0) * (1 - bonif / 100)
  }
  return Math.round(neto * FACTOR_IMPUESTOS_PEDIDO)
}

/** "BRAHMA - X12 1000RET#" → "Brahma 1L retornable"; "BUDWEISER CAN 4X4 710CC" → "Budweiser lata 710cc". */
export function nombreProducto(des: string): string {
  let s = des.replace(/#/g, " ").replace(/\s+-\s+/g, " ").replace(/\s+/g, " ").trim()
  s = s.replace(/\bX\d+\b/gi, "").replace(/\b\d+X\d+\b/gi, "")
  s = s.replace(/\b(\d{3,4})\s*RET\b/i, (_m, ml: string) => ` ${ml === "1000" ? "1L" : `${ml}cc`} RETORNABLE`)
  s = s.replace(/\bRET\b/i, " RETORNABLE ").replace(/\b(CAN|LAT)\b/i, " LATA ")
  s = s.replace(/\s+/g, " ").trim().toLowerCase()
  s = s.replace(/(^|\s)\S/g, (c) => c.toUpperCase())
  return s
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(cc|ml|l)\b/gi, (_m, n: string, u: string) => `${n}${u.toLowerCase() === "l" ? "L" : u.toLowerCase()}`)
    .replace(/\bLata\b/g, "lata")
    .replace(/\bRetornable\b/g, "retornable")
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Detalle por cliente (solo de `ids`). Si Chess falla, devuelve un mapa vacío. */
export async function detallePedidos(
  creds: ChessCredentials,
  fecha: string,
  ids: number[],
): Promise<Map<number, DetallePedido>> {
  const out = new Map<number, DetallePedido>()
  if (!ids.length) return out
  const idSet = new Set(ids)
  const sessionId = await chessLogin(creds)
  const pedidos = (await fetchPedidosByFechaEntrega(creds, sessionId, fecha)).filter(
    (p) => idSet.has(Number(p.idCliente)) && String(p.eliminado) !== "true",
  )
  const idsArt = new Set(pedidos.flatMap((p) => (p.items ?? []).map((it) => Number(it.idArticulo))))
  const arts = await fetchArticulos(creds, sessionId, idsArt)
  const totales = new Map<number, number>()
  for (const p of pedidos) {
    const id = Number(p.idCliente)
    totales.set(id, (totales.get(id) ?? 0) + totalEstimadoPedido(p.items ?? [], arts))
  }

  for (const p of pedidos) {
    const id = Number(p.idCliente)
    const det = out.get(id) ?? { productos: [], total: totales.get(id) || null, cajones_retornables: 0 }
    let fraccionRet = 0
    for (const it of p.items ?? []) {
      if (String(it.anulado) === "true") continue
      const a = arts.get(Number(it.idArticulo))
      if (si(a?.esCombo)) continue
      const bultos = Number(it.cantBultos) || 0
      const unidades = Number(it.cantUnidades) || 0
      if (!bultos && !unidades) continue
      const ret = si(a?.tieneRetornables)
      const partes: string[] = []
      if (bultos) partes.push(ret ? plural(bultos, "cajón", "cajones") : plural(bultos, "bulto", "bultos"))
      if (unidades) partes.push(plural(unidades, "unidad", "unidades"))
      det.productos.push({
        nombre: nombreProducto(a?.desArticulo ?? a?.desCortaArticulo ?? `Artículo ${it.idArticulo}`),
        cantidad: partes.join(" + "),
      })
      if (ret) fraccionRet += bultos + unidades / (Number(a?.unidadesBulto) || 12)
    }
    det.cajones_retornables += Math.ceil(fraccionRet - 1e-9)
    out.set(id, det)
  }
  return out
}

/**
 * Detalle del pedido de cada cliente crítico para el mensaje "listo para
 * copiar" que el vendedor le reenvía al cliente (pedido de Nicolás Lescoulie,
 * 2/11/2026: el promotor copia, pega y les manda la captura a los supervisores).
 *
 * Productos: de los ítems del pedido en Chess, sin la línea encabezado de los
 * combos (sus componentes vienen como líneas propias).
 * Total: de lo FACTURADO en `/ventas` (subtotalFinal: IVA + internos +
 * bonificaciones, lo que ve el cliente en la factura), también sin el
 * encabezado del combo, que repite la suma de sus componentes. Sumar
 * precioUnitario × cantidad daba cualquier cosa (combos contados dos veces,
 * $0 en pedidos por bulto). Si el pedido todavía no está facturado, no se
 * informa total: mejor nada que un número que no es.
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
  total: number | null // facturado; null = todavía sin facturar
  cajones_retornables: number // envases vacíos que tiene que tener listos
}

interface ArticuloChess {
  idArticulo: number
  desArticulo?: string | null
  desCortaArticulo?: string | null
  unidadesBulto?: number | null
  tieneRetornables?: boolean | string | null
  esCombo?: boolean | string | null
}

interface VentaLinea {
  idCliente: number | string
  subtotalFinal?: number | string | null
  anulado?: string | boolean | null
  esCombo?: string | null
}

const si = (v: unknown) => v === true || String(v ?? "").toUpperCase() === "SI" || v === "true"

async function fetchArticulos(creds: ChessCredentials, sessionId: string, ids: Set<number>) {
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

async function fetchTotalFacturado(creds: ChessCredentials, sessionId: string, fecha: string, ids: Set<number>) {
  const out = new Map<number, number>()
  const r = await chessFetch(
    `${creds.baseUrl}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true`,
    { headers: { Accept: "application/json", Cookie: sessionId } },
  )
  if (!r.ok) return out
  const d = (await r.json().catch(() => null)) as
    | { dsReporteComprobantesApi?: { VentasResumen?: VentaLinea[] } }
    | null
  for (const v of d?.dsReporteComprobantesApi?.VentasResumen ?? []) {
    const id = Number(v.idCliente)
    if (!ids.has(id) || si(v.anulado) || si(v.esCombo)) continue
    out.set(id, (out.get(id) ?? 0) + (Number(v.subtotalFinal) || 0))
  }
  return out
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
  const [arts, totales] = await Promise.all([
    fetchArticulos(creds, sessionId, idsArt),
    fetchTotalFacturado(creds, sessionId, fecha, idSet),
  ])

  for (const p of pedidos) {
    const id = Number(p.idCliente)
    const det = out.get(id) ?? { productos: [], total: totales.get(id) ?? null, cajones_retornables: 0 }
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

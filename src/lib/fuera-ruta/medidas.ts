/**
 * Bultos y HL de los pedidos FUERA DE RUTA, desde Chess.
 *
 * El sheet casi nunca los trae, pero el pedido es un pedido normal de Chess
 * (verificado 18/07: 16/16 coinciden por número — Chess lo lista como
 * "NXB-1-715353" en /pedidos/ y como idPedido=715353 numérico en /ventas/):
 *  - PENDIENTE (fecha de hoy en adelante): /pedidos/?fechaEntrega= → items
 *    cantBultos/cantUnidades. Puede cambiar hasta facturarse.
 *  - FACTURADO: /ventas/?detallado=true → cantidadesTotal por línea. Definitivo.
 *
 * HL = bultos × articulos.valor_unidad_medida (+ unidades × vum/unidades_bulto),
 * la MISMA fórmula del ranking y el VRL para que las tres medidas comparen.
 * Verificado contra Chess: unimedtotal = cantidadesTotal × vum (8/8 muestras).
 */
import { chessLogin, type ChessCredentials } from "@/lib/wa-bot/chess"
import { getMaestroArticulos } from "@/lib/chess/pedidos-pendientes"

export interface MedidaPedido {
  bultos: number
  hl: number
}

function creds(): ChessCredentials {
  const baseUrl = process.env.CHESS_API_BASE_URL
  const user = process.env.CHESS_API_USER
  const pass = process.env.CHESS_API_PASS
  if (!baseUrl || !user || !pass) throw new Error("Faltan credenciales de Chess (CHESS_API_*)")
  return { baseUrl, user, pass }
}

const esVerdad = (v: unknown) => v === true || v === "true"

/** "NXB-1-715353" → "715353". El número del sheet es el sufijo numérico. */
function nroDePedidoChess(idPedido: unknown): string | null {
  const m = String(idPedido ?? "").match(/(\d+)$/)
  return m ? m[1] : null
}

interface ChessPedidoItems {
  idPedido?: string
  eliminado?: boolean | string
  items?: {
    idArticulo?: number
    cantBultos?: number
    cantUnidades?: number
    anulado?: boolean | string
  }[]
}

/**
 * Medidas de pedidos PENDIENTES para una fecha de entrega, por número de pedido.
 * Solo devuelve los números pedidos en `nros`.
 */
export async function medidasDesdePedidos(
  fecha: string,
  nros: Set<string>,
): Promise<Map<string, MedidaPedido>> {
  const c = creds()
  const [sessionId, articulos] = await Promise.all([chessLogin(c), getMaestroArticulos()])

  const r = await fetch(`${c.baseUrl}/pedidos/?fechaEntrega=${fecha}`, {
    headers: { Accept: "application/json", Cookie: sessionId },
  })
  if (!r.ok) throw new Error(`Chess GET /pedidos ${fecha}: ${r.status}`)
  const raw = (await r.json()) as { pedidos?: ChessPedidoItems[] }

  const out = new Map<string, MedidaPedido>()
  for (const p of raw.pedidos ?? []) {
    if (esVerdad(p.eliminado)) continue
    const nro = nroDePedidoChess(p.idPedido)
    if (!nro || !nros.has(nro)) continue
    // Un mismo pedido puede venir repetido en la respuesta: la primera gana.
    if (out.has(nro)) continue
    let bultos = 0
    let hl = 0
    for (const it of p.items ?? []) {
      if (esVerdad(it.anulado)) continue
      const b = Number(it.cantBultos) || 0
      const u = Number(it.cantUnidades) || 0
      bultos += b
      const art = it.idArticulo != null ? articulos.get(it.idArticulo) : undefined
      if (art) hl += b * art.vum + (art.unidadesBulto > 0 ? u * (art.vum / art.unidadesBulto) : 0)
    }
    out.set(nro, { bultos, hl })
  }
  return out
}

interface ChessVentaLinea {
  dsDocumento?: string
  anulado?: string
  idPedido?: number | string
  idArticulo?: number
  cantidadesTotal?: number | string
  unimedtotal?: number | string
}

/**
 * Medidas de pedidos FACTURADOS de una fecha, por número de pedido.
 * 🚨 /ventas/ TRUNCA en silencio sin nroLote ⇒ se pagina hasta lote vacío.
 * Solo FACTURA no anulada (las NC de rechazo no restan acá: si después lo
 * rechazaron es otro indicador; lo que medimos es lo que salió fuera de ruta).
 */
export async function medidasDesdeVentas(
  fecha: string,
  nros: Set<string>,
): Promise<Map<string, MedidaPedido>> {
  const c = creds()
  const [sessionId, articulos] = await Promise.all([chessLogin(c), getMaestroArticulos()])

  const out = new Map<string, MedidaPedido>()
  for (let lote = 1; lote <= 40; lote++) {
    const r = await fetch(
      `${c.baseUrl}/ventas/?fechaDesde=${fecha}&fechaHasta=${fecha}&detallado=true&nroLote=${lote}`,
      { headers: { Accept: "application/json", Cookie: sessionId } },
    )
    if (!r.ok) throw new Error(`Chess GET /ventas ${fecha} lote ${lote}: ${r.status}`)
    const d = (await r.json()) as { dsReporteComprobantesApi?: { VentasResumen?: ChessVentaLinea[] } }
    const filas = d?.dsReporteComprobantesApi?.VentasResumen ?? []
    if (filas.length === 0) break
    for (const v of filas) {
      if (v.dsDocumento !== "FACTURA") continue
      if (String(v.anulado ?? "").toUpperCase() === "SI") continue
      const nro = nroDePedidoChess(v.idPedido)
      if (!nro || nro === "0" || !nros.has(nro)) continue
      const b = Number(v.cantidadesTotal) || 0
      const art = v.idArticulo != null ? articulos.get(v.idArticulo) : undefined
      // Sin maestro para el artículo, unimedtotal de Chess ES el HL de la línea.
      const hl = art ? b * art.vum : Number(v.unimedtotal) || 0
      const prev = out.get(nro) ?? { bultos: 0, hl: 0 }
      out.set(nro, { bultos: prev.bultos + b, hl: prev.hl + hl })
    }
  }
  return out
}

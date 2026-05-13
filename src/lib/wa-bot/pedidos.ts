/**
 * Top pedidos del día siguiente para un vendedor (id_promotor).
 *
 * Flujo:
 *   1) bot_clientes_cache → set de id_cliente cuyo id_promotor matchea el vendedor
 *   2) Chess GET /pedidos/?fechaEntrega=fecha → todos los pedidos del día
 *   3) Filtrar por idCliente ∈ clientes del vendedor
 *   4) Por pedido: Σ bultos, Σ monto (sumando items no anulados)
 *   5) Ordenar por bultos desc, devolver top N
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ChessCredentials, ChessPedido } from "./chess"
import { fetchPedidosByFechaEntrega } from "./chess"

export interface PedidoResumen {
  id_cliente: string
  nombre_cliente: string | null
  localidad: string | null
  telefono: string | null
  bultos: number
  monto: number
  items_count: number                          // cantidad de SKUs distintos
}

export interface GetTopPedidosResult {
  fecha: string
  id_promotor: string
  clientes_del_promotor: number                // total de clientes asignados (con o sin pedido)
  pedidos_total: number                        // pedidos del vendedor para esa fecha
  bultos_total: number                         // Σ bultos de todos los pedidos del vendedor
  monto_total: number
  top: PedidoResumen[]
}

interface ClienteCacheRow {
  id_cliente: string
  nombre_cliente: string | null
  localidad: string | null
  telefono: string | null
}

/**
 * Trae el top N pedidos de `fecha` para `id_promotor`, ordenados por Σ bultos.
 * - `topN`: cantidad de pedidos a devolver (default 5).
 * - Pedidos eliminados / items anulados no se cuentan.
 */
export async function getTopPedidosForVendedor(
  supabase: SupabaseClient,
  chess: { creds: ChessCredentials; sessionId: string },
  args: { id_promotor: string; fecha: string; topN?: number },
): Promise<GetTopPedidosResult> {
  const { id_promotor, fecha } = args
  const topN = args.topN ?? 5

  // 1) Clientes del promotor (de la cache, paginando para esquivar límite PostgREST de 1000)
  const clientesMap = await loadClientesDelPromotor(supabase, id_promotor)

  // Caso borde: vendedor sin clientes en cache → devolver vacío sin pegarle a Chess
  if (clientesMap.size === 0) {
    return {
      fecha, id_promotor,
      clientes_del_promotor: 0, pedidos_total: 0,
      bultos_total: 0, monto_total: 0, top: [],
    }
  }

  // 2) Pedidos del día siguiente desde Chess
  const allPedidos = await fetchPedidosByFechaEntrega(chess.creds, chess.sessionId, fecha)

  // 3+4) Filtrar y resumir
  const resumenes: PedidoResumen[] = []
  let bultosTotal = 0, montoTotal = 0
  for (const p of allPedidos) {
    if (p.eliminado === "true") continue
    const id = String(p.idCliente)
    const cli = clientesMap.get(id)
    if (!cli) continue                          // no es del vendedor

    let bultos = 0, monto = 0, items = 0
    for (const it of p.items ?? []) {
      if (it.anulado === "true") continue
      const b = Number(it.cantBultos ?? 0)
      const pu = Number(it.precioUnitario ?? 0)
      const u = Number(it.cantUnidades ?? 0)
      bultos += b
      monto += pu * u
      items += 1
    }
    if (bultos === 0 && monto === 0) continue
    resumenes.push({
      id_cliente: id,
      nombre_cliente: cli.nombre_cliente,
      localidad: cli.localidad,
      telefono: cli.telefono,
      bultos, monto, items_count: items,
    })
    bultosTotal += bultos
    montoTotal += monto
  }

  // 5) Top N por bultos desc, tie-break por monto desc
  resumenes.sort((a, b) => (b.bultos - a.bultos) || (b.monto - a.monto))
  const top = resumenes.slice(0, topN)

  return {
    fecha, id_promotor,
    clientes_del_promotor: clientesMap.size,
    pedidos_total: resumenes.length,
    bultos_total: bultosTotal,
    monto_total: montoTotal,
    top,
  }
}

async function loadClientesDelPromotor(
  supabase: SupabaseClient, id_promotor: string,
): Promise<Map<string, ClienteCacheRow>> {
  const PAGE = 1000
  const out = new Map<string, ClienteCacheRow>()
  let from = 0
  while (true) {
    const to = from + PAGE - 1
    const { data, error } = await supabase
      .from("bot_clientes_cache")
      .select("id_cliente, nombre_cliente, localidad, telefono")
      .eq("id_promotor", id_promotor)
      .range(from, to)
    if (error) throw new Error(`bot_clientes_cache: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as ClienteCacheRow[]) out.set(r.id_cliente, r)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

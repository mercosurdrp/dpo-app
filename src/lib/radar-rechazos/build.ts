/**
 * Radar de Rechazos del Día Siguiente — armado de la foto.
 *
 * Cruza los pedidos ruteados de MAÑANA (Chess) contra el historial de rechazos
 * por CERRADO (id_rechazo 1) y SIN DINERO (id_rechazo 6) de cada cliente, en dos
 * ventanas: últimos 365 días y últimos 30 días. Devuelve solo los clientes EN
 * RIESGO (los que se entregan mañana Y tienen historial en esos motivos),
 * agrupables por promotor, para que ventas avise al cliente y evite el rechazo.
 *
 * Lo consume el cron `/api/radar-rechazos/cron`, que congela el resultado en
 * `radar_rechazos_snapshot` + `radar_rechazos_cliente`.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  chessLogin,
  fetchPedidosByFechaEntrega,
  fetchRutasVenta,
  type ChessCredentials,
  type ChessPedido,
} from "@/lib/wa-bot/chess"

export const ID_CERRADO = 1
export const ID_SIN_DINERO = 6

export interface RadarClienteRow {
  id_cliente: number | null
  nombre_cliente: string | null
  localidad: string | null
  telefono: string | null
  id_promotor: string | null
  nombre_promotor: string | null
  reparto: string | null
  bultos_pedido: number
  monto_pedido: number
  cerrado_anio: number
  cerrado_mes: number
  sin_dinero_anio: number
  sin_dinero_mes: number
  riesgo_total: number
}

export interface RadarSnapshot {
  fecha_entrega: string
  total_clientes_dia: number          // clientes con pedido (con bultos) ese día
  total_clientes_riesgo: number       // de esos, cuántos con historial cerrado/sin dinero
  total_bultos_riesgo: number
  total_monto_riesgo: number
  clientes: RadarClienteRow[]
}

interface PedidoAgg {
  id_cliente: number
  bultos: number
  monto: number
  reparto: string | null
}

/** YYYY-MM-DD de "hoy" en horario Argentina. */
export function hoyART(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  const d = parts.find((p) => p.type === "day")!.value
  return `${y}-${m}-${d}`
}

/** YYYY-MM-DD de "mañana" en horario Argentina. */
export function mananaART(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000))
  const y = parts.find((p) => p.type === "year")!.value
  const m = parts.find((p) => p.type === "month")!.value
  const d = parts.find((p) => p.type === "day")!.value
  return `${y}-${m}-${d}`
}

/** Resta `dias` a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/** Agrega los pedidos (no eliminados, items no anulados) por cliente. */
function agruparPedidos(pedidos: ChessPedido[]): Map<number, PedidoAgg> {
  const map = new Map<number, PedidoAgg>()
  for (const p of pedidos) {
    if (p.eliminado === "true") continue
    let bultos = 0, monto = 0
    for (const it of p.items ?? []) {
      if (it.anulado === "true") continue
      bultos += Number(it.cantBultos ?? 0)
      monto += Number(it.precioUnitario ?? 0) * Number(it.cantUnidades ?? 0)
    }
    if (bultos === 0 && monto === 0) continue
    const id = Number(p.idCliente)
    const reparto = p.Reparto && p.Reparto.trim() ? p.Reparto.trim() : null
    const ex = map.get(id)
    if (ex) {
      ex.bultos += bultos
      ex.monto += monto
      if (!ex.reparto && reparto) ex.reparto = reparto
    } else {
      map.set(id, { id_cliente: id, bultos, monto, reparto })
    }
  }
  return map
}

interface MotivoCount {
  cerrado_anio: number
  cerrado_mes: number
  sin_dinero_anio: number
  sin_dinero_mes: number
}

/**
 * Trae los rechazos por CERRADO / SIN DINERO de los últimos 365 días (imputados
 * a fecha_venta) y los cuenta por cliente, separando además la sub-ventana de 30
 * días. Pagina para esquivar el tope de 1000 de PostgREST.
 */
async function contarRechazosPorCliente(
  supabase: SupabaseClient, hoy: string,
): Promise<Map<number, MotivoCount>> {
  const desdeAnio = restarDias(hoy, 365)
  const desdeMes = restarDias(hoy, 30)
  const counts = new Map<number, MotivoCount>()
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from("rechazos")
      .select("id_cliente, id_rechazo, fecha_venta")
      .in("id_rechazo", [ID_CERRADO, ID_SIN_DINERO])
      .gte("fecha_venta", desdeAnio)
      .lte("fecha_venta", hoy)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`rechazos: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as { id_cliente: number | null; id_rechazo: number; fecha_venta: string | null }[]) {
      if (r.id_cliente == null) continue
      const c = counts.get(r.id_cliente) ?? {
        cerrado_anio: 0, cerrado_mes: 0, sin_dinero_anio: 0, sin_dinero_mes: 0,
      }
      const enMes = !!r.fecha_venta && r.fecha_venta >= desdeMes
      if (r.id_rechazo === ID_CERRADO) {
        c.cerrado_anio += 1
        if (enMes) c.cerrado_mes += 1
      } else if (r.id_rechazo === ID_SIN_DINERO) {
        c.sin_dinero_anio += 1
        if (enMes) c.sin_dinero_mes += 1
      }
      counts.set(r.id_cliente, c)
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return counts
}

interface ClienteCacheRow {
  id_cliente: string
  nombre_cliente: string | null
  localidad: string | null
  telefono: string | null
  id_promotor: string | null
}

/** Trae datos de contacto + promotor de un set de clientes desde la cache. */
async function loadClientesCache(
  supabase: SupabaseClient, ids: number[],
): Promise<Map<number, ClienteCacheRow>> {
  const out = new Map<number, ClienteCacheRow>()
  const CHUNK = 500
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK).map(String)
    const { data, error } = await supabase
      .from("bot_clientes_cache")
      .select("id_cliente, nombre_cliente, localidad, telefono, id_promotor")
      .in("id_cliente", slice)
    if (error) throw new Error(`bot_clientes_cache: ${error.message}`)
    for (const r of (data ?? []) as ClienteCacheRow[]) out.set(Number(r.id_cliente), r)
  }
  return out
}

/**
 * Arma el radar de rechazos para `fecha` (default: mañana ART).
 * Devuelve solo los clientes en riesgo, ordenados por riesgo_total desc.
 */
export async function buildRadarRechazos(
  supabase: SupabaseClient,
  creds: ChessCredentials,
  fecha: string = mananaART(),
): Promise<RadarSnapshot> {
  const hoy = hoyART()

  // 1) Pedidos de mañana (Chess) + mapa promotor→nombre
  const sessionId = await chessLogin(creds)
  const [pedidos, rutas] = await Promise.all([
    fetchPedidosByFechaEntrega(creds, sessionId, fecha),
    fetchRutasVenta(creds, sessionId),
  ])
  const promotorNombre = new Map<string, string>()
  for (const ru of rutas) {
    if (ru.idPersonal != null && ru.desPersonal) {
      promotorNombre.set(String(ru.idPersonal), ru.desPersonal)
    }
  }

  const pedidosPorCliente = agruparPedidos(pedidos)
  const idsDia = [...pedidosPorCliente.keys()]

  // 2) Historial de rechazos (cerrado/sin dinero) + datos de cache en paralelo
  const [rechazosCount, cache] = await Promise.all([
    contarRechazosPorCliente(supabase, hoy),
    loadClientesCache(supabase, idsDia),
  ])

  // 3) Cruce: solo clientes del día CON historial de rechazo
  const clientes: RadarClienteRow[] = []
  let bultosRiesgo = 0, montoRiesgo = 0
  for (const [id, ped] of pedidosPorCliente) {
    const rc = rechazosCount.get(id)
    if (!rc) continue
    const riesgo = rc.cerrado_anio + rc.sin_dinero_anio
    if (riesgo === 0) continue

    const cli = cache.get(id)
    const idProm = cli?.id_promotor ?? null
    clientes.push({
      id_cliente: id,
      nombre_cliente: cli?.nombre_cliente ?? null,
      localidad: cli?.localidad ?? null,
      telefono: cli?.telefono ?? null,
      id_promotor: idProm,
      nombre_promotor: idProm ? promotorNombre.get(idProm) ?? null : null,
      reparto: ped.reparto,
      bultos_pedido: ped.bultos,
      monto_pedido: ped.monto,
      cerrado_anio: rc.cerrado_anio,
      cerrado_mes: rc.cerrado_mes,
      sin_dinero_anio: rc.sin_dinero_anio,
      sin_dinero_mes: rc.sin_dinero_mes,
      riesgo_total: riesgo,
    })
    bultosRiesgo += ped.bultos
    montoRiesgo += ped.monto
  }

  // Orden: más riesgo primero; desempate por bultos en juego
  clientes.sort(
    (a, b) => (b.riesgo_total - a.riesgo_total) || (b.bultos_pedido - a.bultos_pedido),
  )

  return {
    fecha_entrega: fecha,
    total_clientes_dia: pedidosPorCliente.size,
    total_clientes_riesgo: clientes.length,
    total_bultos_riesgo: bultosRiesgo,
    total_monto_riesgo: montoRiesgo,
    clientes,
  }
}

"use server"

import { getPool } from "@/lib/mercosur-dashboard"
import { getPedidosPendientes } from "@/lib/chess/pedidos-pendientes"
import {
  priorizarPorCiudad,
  PESOS_DEFAULT,
  VENTANA_DIAS,
  VENTANA_RECIENTE_DIAS,
  type EntradaPriorizacion,
  type PesosPriorizacion,
  type CiudadPriorizada,
} from "@/lib/priorizacion/score"
import type { ClusterId } from "./clusterizacion-tipos"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "La priorización de entrega solo está disponible en Pampeana."

export interface PriorizacionData {
  fecha_entrega: string
  /** Ventana de comportamiento usada. */
  desde: string
  hasta: string
  ciudades: CiudadPriorizada[]
  total_clientes: number
  total_bultos: number
  total_hl: number
  total_monto: number
  /** Clientes que ya venían pospuestos de días anteriores. */
  pospuestos: number
  pesos: PesosPriorizacion
}

/** Resta días a un YYYY-MM-DD. */
function restarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map((s) => parseInt(s, 10))
  const dt = new Date(Date.UTC(y, m - 1, d - dias))
  return dt.toISOString().slice(0, 10)
}

/**
 * Cluster + ENTREGAS REALES por cliente, desde la base de ventas (`comprobantes`).
 *
 * 🚨 El denominador de entregas NO puede salir de `serie`/`nrodoc`: están NULL en el
 * 89% de las filas. Una ENTREGA = un DÍA CON COMPRA del cliente (id_cliente + fecha).
 * Se excluyen notas de crédito y devoluciones, que no son entregas.
 */
async function getPerfilClientes(
  desde: string,
  hasta: string,
): Promise<Map<number, { nombre: string | null; localidad: string | null; cluster: ClusterId; entregas: number }>> {
  const pool = getPool()
  // Semestre calendario cerrado vs el mismo del año anterior (igual que la clusterización).
  const [ventas, entregas] = await Promise.all([
    pool.query<{ id_cliente: number; nombre: string; loc: string; act: string; ant: string }>(`
      select id_cliente, max(nombre_cliente) nombre, max(ds_localidad) loc,
        sum(case when fecha >= '2026-01-01' and fecha < '2026-07-01' then subtotal_neto else 0 end) act,
        sum(case when fecha >= '2025-01-01' and fecha < '2025-07-01' then subtotal_neto else 0 end) ant
      from comprobantes
      where anulado = 'NO' and id_cliente is not null
        and fecha >= '2025-01-01' and fecha < '2026-07-01'
      group by id_cliente`),
    pool.query<{ id_cliente: number; n: string }>(`
      select id_cliente, count(distinct fecha::date) n
      from comprobantes
      where anulado = 'NO' and id_cliente is not null
        and fecha >= $1 and fecha <= $2
        and ds_documento in ('FACTURA', 'FACTURA PRESUPUESTO')
      group by id_cliente`, [desde, hasta]),
  ])

  const facturacion = ventas.rows.map((v) => Number(v.act)).filter((v) => v > 0).sort((a, b) => a - b)
  const mediana = facturacion.length ? facturacion[Math.floor(facturacion.length / 2)] : 0
  const entregasPorCliente = new Map(entregas.rows.map((e) => [Number(e.id_cliente), Number(e.n)]))

  const out = new Map<number, { nombre: string | null; localidad: string | null; cluster: ClusterId; entregas: number }>()
  for (const v of ventas.rows) {
    const act = Number(v.act)
    if (act <= 0) continue
    const ant = Number(v.ant)
    const crece = ant > 0 ? (act - ant) / ant >= 0 : true   // cliente nuevo cuenta como "crece"
    const alto = act >= mediana
    const cluster: ClusterId = alto
      ? (crece ? "ganador" : "basico")
      : (crece ? "en_crecimiento" : "ventas_bajas")
    const id = Number(v.id_cliente)
    out.set(id, { nombre: v.nombre, localidad: v.loc, cluster, entregas: entregasPorCliente.get(id) ?? 0 })
  }
  return out
}

/**
 * Rechazos POR CAUSA DEL CLIENTE en la ventana, agregados por cliente.
 * 🚨 `rechazos` tiene UNA FILA POR ARTÍCULO. La agregación (juntar líneas por entrega,
 * motivo predominante, filtrar a los motivos por culpa) la hace la función Postgres
 * `rechazos_culpa_cliente` en UNA llamada, en vez de traer la tabla entera paginada.
 * `motivos` viene ya formateado ("SIN DINERO×3, CERRADO×1").
 */
async function getRechazosPorCliente(desde: string, hasta: string) {
  const supabase = await createClient()
  const acc = new Map<number, { eventos: number; pesados: number; motivos: string }>()
  const { data, error } = await supabase.rpc("rechazos_culpa_cliente", { desde, hasta })
  if (error || !data) return acc   // rechazo es opcional: si la RPC no está, seguimos sin él
  // La RPC devuelve un objeto { "<id>": { eventos, pesados, motivos } }.
  for (const [id, v] of Object.entries(data as Record<string, { eventos: number; pesados: number; motivos: string }>)) {
    acc.set(Number(id), { eventos: v.eventos, pesados: Number(v.pesados), motivos: v.motivos ?? "" })
  }
  return acc
}

/** RMD y NPS: banderas informativas, NO entran al score (medidos: no discriminan). */
async function getBanderas(desde: string) {
  const supabase = await createClient()
  const rmd = new Map<number, { suma: number; n: number }>()
  // La RPC devuelve un objeto { "<cod>": { prom, n } } en un solo request. Se devuelve
  // como jsonb (no set) justamente para no chocar con el techo de 1.000 filas de PostgREST.
  const { data: rmdData } = await supabase.rpc("rmd_promedio_cliente", { desde })
  for (const [cod, v] of Object.entries((rmdData ?? {}) as Record<string, { prom: number; n: number }>)) {
    // Se guarda como suma/n para no tocar el consumidor (rmd.suma / rmd.n).
    rmd.set(Number(cod), { suma: Number(v.prom) * v.n, n: v.n })
  }
  const nps = new Map<number, string>()
  const { data: enc } = await supabase
    .from("nps_encuestas")
    .select("cod_cliente, categoria, fecha_enc")
    .order("fecha_enc", { ascending: false })
    .limit(5000)
  for (const r of (enc ?? []) as { cod_cliente: number; categoria: string }[]) {
    if (!nps.has(r.cod_cliente)) nps.set(r.cod_cliente, r.categoria)
  }
  return { rmd, nps }
}

/** Cuántas veces ya se le pospuso el pedido a cada cliente (últimos 30 días). */
async function getPospuestos(fechaEntrega: string): Promise<Map<number, number>> {
  const supabase = await createClient()
  const m = new Map<number, number>()
  const { data, error } = await supabase
    .from("entrega_cortes")
    .select("id_cliente")
    .gte("fecha_entrega", restarDias(fechaEntrega, 30))
    .lt("fecha_entrega", fechaEntrega)
  if (error || !data) return m   // si la tabla todavía no existe, seguimos sin envejecimiento
  for (const r of data as { id_cliente: number }[]) {
    m.set(r.id_cliente, (m.get(r.id_cliente) ?? 0) + 1)
  }
  return m
}

export async function getPriorizacionEntrega(
  fechaEntrega: string,
  pesos: PesosPriorizacion = PESOS_DEFAULT,
): Promise<Result<PriorizacionData>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  try {
    const hasta = restarDias(fechaEntrega, 1)          // el comportamiento se mide hasta ayer
    const desde = restarDias(hasta, VENTANA_DIAS)
    const desdeReciente = restarDias(hasta, VENTANA_RECIENTE_DIAS)  // bandera "rechazó hace poco"

    const [pedidos, perfiles, rechazos, rechazosRecientes, banderas, pospuestos] = await Promise.all([
      getPedidosPendientes(fechaEntrega),
      getPerfilClientes(desde, hasta),
      getRechazosPorCliente(desde, hasta),
      getRechazosPorCliente(desdeReciente, hasta),
      getBanderas(desde),
      getPospuestos(fechaEntrega),
    ])

    if (pedidos.length === 0) {
      return { error: `No hay pedidos pendientes con fecha de entrega ${fechaEntrega}.` }
    }

    const entradas: EntradaPriorizacion[] = pedidos.map((p) => {
      const perfil = perfiles.get(p.id_cliente)
      const r = rechazos.get(p.id_cliente)
      const rmd = banderas.rmd.get(p.id_cliente)
      return {
        id_cliente: p.id_cliente,
        nombre: perfil?.nombre ?? null,
        localidad: perfil?.localidad ?? null,
        bultos: p.bultos,
        hl: p.hl,
        monto: p.monto,
        cluster: perfil?.cluster ?? null,
        entregas: perfil?.entregas ?? 0,
        rechazos: r?.eventos ?? 0,
        rechazos_pesados: r?.pesados ?? 0,
        motivos: r?.motivos ?? "",
        rechazos_45d: rechazosRecientes.get(p.id_cliente)?.eventos ?? 0,
        veces_pospuesto: pospuestos.get(p.id_cliente) ?? 0,
        rmd_prom: rmd ? rmd.suma / rmd.n : null,
        nps_categoria: banderas.nps.get(p.id_cliente) ?? null,
      }
    })

    const ciudades = priorizarPorCiudad(entradas, pesos)

    return {
      data: {
        fecha_entrega: fechaEntrega,
        desde,
        hasta,
        ciudades,
        total_clientes: entradas.length,
        total_bultos: entradas.reduce((a, e) => a + e.bultos, 0),
        total_hl: entradas.reduce((a, e) => a + e.hl, 0),
        total_monto: entradas.reduce((a, e) => a + e.monto, 0),
        pospuestos: entradas.filter((e) => e.veces_pospuesto > 0).length,
        pesos,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al calcular la priorización." }
  }
}

/** Registra el corte del día: los clientes que quedaron afuera. Alimenta el envejecimiento. */
export async function registrarCorte(
  fechaEntrega: string,
  cortados: {
    id_cliente: number; nombre_cliente: string | null; localidad: string | null
    bultos: number; hl: number; monto: number; score: number; posicion: number
    comportamiento: number; cluster: string | null; veces_previas: number; motivo: string
  }[],
): Promise<Result<{ registrados: number }>> {
  const perfil = await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }
  if (cortados.length === 0) return { error: "No hay clientes cortados para registrar." }

  const supabase = await createClient()
  // 🚨 PostgREST exige claves IDÉNTICAS en un insert múltiple (PGRST102): armamos las
  // filas con exactamente las mismas columnas.
  const filas = cortados.map((c) => ({
    fecha_entrega: fechaEntrega,
    id_cliente: c.id_cliente,
    nombre_cliente: c.nombre_cliente,
    localidad: c.localidad,
    bultos: c.bultos,
    hl: c.hl,
    monto: c.monto,
    score: c.score,
    posicion: c.posicion,
    comportamiento: c.comportamiento,
    cluster: c.cluster,
    veces_previas: c.veces_previas,
    motivo: c.motivo,
    nota: null as string | null,
    cortado_por: perfil.email,
  }))

  const { error } = await supabase
    .from("entrega_cortes")
    .upsert(filas, { onConflict: "fecha_entrega,id_cliente" })
  if (error) return { error: `No se pudo registrar el corte: ${error.message}` }
  return { data: { registrados: filas.length } }
}

// ─────────────────────────────────────────────────────────────────────────────
// VRL — VOLUMEN REPROGRAMADO LOGÍSTICO
//
// El volumen (BULTOS y HL) de los pedidos que quedaron afuera del ruteo por falta de
// capacidad, acumulado POR MES. Es una variable DISTINTA del "Volumen Reprogramado por
// crédito" (ese mide pedidos trabados por límite de crédito y vive en Railway), pero se
// mide en la MISMA unidad para que sean comparables: bultos + HL, con
// HL = Σ cantBultos × valor_unidad_medida (HL por bulto, maestro `articulos`).
// ─────────────────────────────────────────────────────────────────────────────

export interface VrlMes {
  anio_mes: string
  pedidos_reprogramados: number
  clientes: number
  bultos: number
  hl: number
  monto: number
}

/** VRL acumulado por mes (default: los últimos 12 meses). */
export async function getVrlMensual(meses = 12): Promise<Result<VrlMes[]>> {
  await requireAuth()
  if (IS_MISIONES) return { error: SOLO_PAMPEANA }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("v_vrl_mensual")
    .select("*")
    .limit(meses)
  if (error) return { error: `No se pudo leer el VRL: ${error.message}` }

  return {
    data: (data ?? []).map((r) => ({
      anio_mes: String(r.anio_mes),
      pedidos_reprogramados: Number(r.pedidos_reprogramados ?? 0),
      clientes: Number(r.clientes ?? 0),
      bultos: Number(r.bultos ?? 0),
      hl: Number(r.hl ?? 0),
      monto: Number(r.monto ?? 0),
    })),
  }
}

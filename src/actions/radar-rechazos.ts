"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { UMBRAL_CRITICO_DEFAULT } from "@/lib/radar-rechazos/build"

export interface RadarClienteView {
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
  bultos_rechazados_anio: number
  riesgo_total: number
}

export interface RadarView {
  fecha_entrega: string
  generado_at: string
  total_clientes_dia: number
  total_clientes_riesgo: number
  total_bultos_riesgo: number
  total_monto_riesgo: number
  clientes: RadarClienteView[]
}

export interface RadarFechaOption {
  fecha_entrega: string
  total_clientes_dia: number
  total_clientes_riesgo: number
}

/**
 * Fechas de entrega con foto guardada, de la más nueva a la más vieja, para el
 * selector de "ver una foto anterior".
 *
 * 🚨 Se saltean las fotos vacías (`total_clientes_dia = 0`): son los domingos
 * que el cron llegó a generar ANTES del fix que hace saltear el domingo, y no
 * hay nada para consultar en ellas.
 */
export async function getRadarFechas(): Promise<
  { data: RadarFechaOption[] } | { error: string }
> {
  try {
    await requireAuth()
    const supa = await createClient()

    const { data, error } = await supa
      .from("radar_rechazos_snapshot")
      .select("fecha_entrega, total_clientes_dia, total_clientes_riesgo")
      .gt("total_clientes_dia", 0)
      .order("fecha_entrega", { ascending: false })
      .limit(180)
    if (error) return { error: error.message }

    return { data: (data ?? []) as RadarFechaOption[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando fechas" }
  }
}

/**
 * Foto del Radar de Rechazos. Sin `fecha` devuelve la más reciente (la vigente);
 * con `fecha` devuelve la foto histórica de ese día de entrega, tal como se
 * generó en su momento — sirve para consultar días para atrás.
 *
 * Devuelve la cabecera + los clientes en riesgo ordenados por riesgo desc.
 * `null` si no hay foto (ninguna generada, o ninguna para esa fecha).
 */
export async function getRadarRechazos(
  fecha?: string,
): Promise<{ data: RadarView | null } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    let q = supa
      .from("radar_rechazos_snapshot")
      .select(
        "id, fecha_entrega, generado_at, total_clientes_dia, total_clientes_riesgo, total_bultos_riesgo, total_monto_riesgo",
      )
    q = fecha
      ? q.eq("fecha_entrega", fecha)
      : q.order("fecha_entrega", { ascending: false })

    const { data: header, error: hErr } = await q.limit(1).maybeSingle()
    if (hErr) return { error: hErr.message }
    if (!header) return { data: null }

    const { data: clientes, error: cErr } = await supa
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, telefono, id_promotor, nombre_promotor, reparto, bultos_pedido, monto_pedido, cerrado_anio, cerrado_mes, sin_dinero_anio, sin_dinero_mes, bultos_rechazados_anio, riesgo_total",
      )
      .eq("snapshot_id", header.id)
      .order("riesgo_total", { ascending: false })
    if (cErr) return { error: cErr.message }

    return {
      data: {
        fecha_entrega: header.fecha_entrega,
        generado_at: header.generado_at,
        total_clientes_dia: header.total_clientes_dia,
        total_clientes_riesgo: header.total_clientes_riesgo,
        total_bultos_riesgo: Number(header.total_bultos_riesgo ?? 0),
        total_monto_riesgo: Number(header.total_monto_riesgo ?? 0),
        clientes: (clientes ?? []).map((c) => ({
          ...c,
          bultos_pedido: Number(c.bultos_pedido ?? 0),
          monto_pedido: Number(c.monto_pedido ?? 0),
          bultos_rechazados_anio: Number(c.bultos_rechazados_anio ?? 0),
        })) as RadarClienteView[],
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el radar" }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Clientes CRÍTICOS para el PDF de Ventas
// ─────────────────────────────────────────────────────────────────────────

export interface RadarCriticoRow {
  id_cliente: number | null
  nombre_cliente: string | null
  localidad: string | null
  id_promotor: string | null
  nombre_promotor: string | null
  bultos_pedido: number
  monto_pedido: number
  sin_dinero_calendario: number
  cerrado_calendario: number
  bultos_rechazados_calendario: number
}

export interface RadarCriticosData {
  fecha_entrega: string
  generado_at: string
  anio: number
  umbral: number
  total_en_riesgo: number
  criticos: RadarCriticoRow[]
  /** false = foto histórica: es una consulta, no hay a quién avisar hoy. */
  es_vigente: boolean
}

const ID_CERRADO = 1
const ID_SIN_DINERO = 6

/**
 * Clientes CRÍTICOS de una foto del radar (sin `fecha`, la más reciente): los
 * que tienen MÁS de `umbral` VECES de rechazo por SIN DINERO en el AÑO
 * CALENDARIO de la entrega (recontado desde el 1-ene, no la ventana de 365 días
 * que guarda el snapshot). Ordenados por promotor y, dentro, por cantidad de sin
 * dinero desc. Para el PDF de Ventas.
 *
 * 🚨 VECES = cliente × fecha_venta distinta; `rechazos` tiene una fila por
 * artículo, así que contar filas infla el número (ver build.ts).
 *
 * 🚨 Sobre una foto vieja, la lista de clientes es la que quedó congelada, pero
 * el conteo de rechazos se recalcula CONTRA HOY: un cliente puede aparecer con
 * más rechazos de los que tenía aquel día.
 */
export async function getRadarCriticos(
  umbral: number = UMBRAL_CRITICO_DEFAULT,
  fecha?: string,
): Promise<{ data: RadarCriticosData | null } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    let hq = supa
      .from("radar_rechazos_snapshot")
      .select("id, fecha_entrega, generado_at")
    hq = fecha
      ? hq.eq("fecha_entrega", fecha)
      : hq.order("fecha_entrega", { ascending: false })

    const { data: header, error: hErr } = await hq.limit(1).maybeSingle()
    if (hErr) return { error: hErr.message }
    if (!header) return { data: null }

    // ¿Es la foto vigente o una consulta histórica? Cambia el tono del PDF.
    let es_vigente = true
    if (fecha) {
      const { data: ultima } = await supa
        .from("radar_rechazos_snapshot")
        .select("fecha_entrega")
        .order("fecha_entrega", { ascending: false })
        .limit(1)
        .maybeSingle()
      es_vigente = !ultima || ultima.fecha_entrega === header.fecha_entrega
    }

    const { data: enRiesgo, error: cErr } = await supa
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, id_promotor, nombre_promotor, bultos_pedido, monto_pedido",
      )
      .eq("snapshot_id", header.id)
    if (cErr) return { error: cErr.message }

    const anio = Number(String(header.fecha_entrega).slice(0, 4))
    const desde = `${anio}-01-01`
    const ids = (enRiesgo ?? [])
      .map((c) => c.id_cliente)
      .filter((id): id is number => id != null)

    // Conteo calendario (sin dinero / cerrado) de los clientes en riesgo, en
    // VECES: las fechas van a un Set para que los N artículos de un mismo
    // rechazo cuenten 1. Los bultos rechazados sí se suman fila por fila.
    const calen = new Map<
      number, { sd: Set<string>; ce: Set<string>; bultos: number }
    >()
    if (ids.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data, error } = await supa
          .from("rechazos")
          .select("id_cliente, id_rechazo, fecha_venta, bultos_rechazados")
          .in("id_cliente", ids)
          .in("id_rechazo", [ID_CERRADO, ID_SIN_DINERO])
          .gte("fecha_venta", desde)
          .range(from, from + PAGE - 1)
        if (error) return { error: error.message }
        if (!data || data.length === 0) break
        for (const r of data as {
          id_cliente: number | null
          id_rechazo: number
          fecha_venta: string | null
          bultos_rechazados: number | null
        }[]) {
          if (r.id_cliente == null || !r.fecha_venta) continue
          const c = calen.get(r.id_cliente) ?? {
            sd: new Set<string>(), ce: new Set<string>(), bultos: 0,
          }
          if (r.id_rechazo === ID_SIN_DINERO) c.sd.add(r.fecha_venta)
          else if (r.id_rechazo === ID_CERRADO) c.ce.add(r.fecha_venta)
          c.bultos += Number(r.bultos_rechazados ?? 0)
          calen.set(r.id_cliente, c)
        }
        if (data.length < PAGE) break
        from += PAGE
      }
    }

    const criticos: RadarCriticoRow[] = (enRiesgo ?? [])
      .map((c) => {
        const cc = c.id_cliente != null ? calen.get(c.id_cliente) : undefined
        return {
          id_cliente: c.id_cliente,
          nombre_cliente: c.nombre_cliente,
          localidad: c.localidad,
          id_promotor: c.id_promotor,
          nombre_promotor: c.nombre_promotor,
          bultos_pedido: Number(c.bultos_pedido ?? 0),
          monto_pedido: Number(c.monto_pedido ?? 0),
          sin_dinero_calendario: cc?.sd.size ?? 0,
          cerrado_calendario: cc?.ce.size ?? 0,
          bultos_rechazados_calendario: Math.round(cc?.bultos ?? 0),
        }
      })
      .filter((c) => c.sin_dinero_calendario > umbral)
      .sort(
        (a, b) =>
          (a.nombre_promotor ?? "~").localeCompare(b.nombre_promotor ?? "~") ||
          b.sin_dinero_calendario - a.sin_dinero_calendario ||
          (a.nombre_cliente ?? "").localeCompare(b.nombre_cliente ?? ""),
      )

    return {
      data: {
        fecha_entrega: header.fecha_entrega,
        generado_at: header.generado_at,
        anio,
        umbral,
        total_en_riesgo: (enRiesgo ?? []).length,
        criticos,
        es_vigente,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando críticos" }
  }
}

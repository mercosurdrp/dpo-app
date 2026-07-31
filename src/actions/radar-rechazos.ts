"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  evaluarCriticidad,
  UMBRAL_30D,
  UMBRAL_ANIO,
} from "@/lib/radar-rechazos/criterio"

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
  /** Veces en los últimos 30 días (cerrado + sin dinero). */
  rechazos_30d: number
  /** Veces en los últimos 365 días (cerrado + sin dinero). */
  rechazos_anio: number
  sin_dinero_anio: number
  cerrado_anio: number
  bultos_rechazados_anio: number
  /** Qué condición lo hizo entrar (puede ser una, la otra, o las dos). */
  por_ultimos_30d: boolean
  por_promedio_anio: boolean
}

export interface RadarCriticosData {
  fecha_entrega: string
  generado_at: string
  umbral_30d: number
  umbral_anio: number
  total_en_riesgo: number
  criticos: RadarCriticoRow[]
  /** false = foto histórica: es una consulta, no hay a quién avisar hoy. */
  es_vigente: boolean
}

/**
 * Clientes CRÍTICOS de una foto del radar (sin `fecha`, la más reciente), según
 * el criterio compartido de `@/lib/radar-rechazos/criterio`: 2 o más rechazos en
 * los últimos 30 días, o más de 1 por mes en promedio en 12 meses, sumando
 * cerrado + sin dinero. Ordenados por promotor y, dentro, por los más recientes.
 * Para el PDF de Ventas.
 *
 * 🚨 Los conteos salen del SNAPSHOT, no se recalculan sobre `rechazos`: así el
 * criterio queda coherente con la foto (una foto vieja muestra los que eran
 * críticos ESE día) y se evita paginar una tabla con una fila por artículo.
 */
export async function getRadarCriticos(
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
        "id_cliente, nombre_cliente, localidad, id_promotor, nombre_promotor, bultos_pedido, monto_pedido, cerrado_mes, sin_dinero_mes, cerrado_anio, sin_dinero_anio, bultos_rechazados_anio",
      )
      .eq("snapshot_id", header.id)
    if (cErr) return { error: cErr.message }

    const criticos: RadarCriticoRow[] = (enRiesgo ?? [])
      .map((c) => {
        const crit = evaluarCriticidad(c)
        return {
          id_cliente: c.id_cliente,
          nombre_cliente: c.nombre_cliente,
          localidad: c.localidad,
          id_promotor: c.id_promotor,
          nombre_promotor: c.nombre_promotor,
          bultos_pedido: Number(c.bultos_pedido ?? 0),
          monto_pedido: Number(c.monto_pedido ?? 0),
          rechazos_30d: crit.rechazos_30d,
          rechazos_anio: crit.rechazos_anio,
          sin_dinero_anio: Number(c.sin_dinero_anio ?? 0),
          cerrado_anio: Number(c.cerrado_anio ?? 0),
          bultos_rechazados_anio: Math.round(Number(c.bultos_rechazados_anio ?? 0)),
          por_ultimos_30d: crit.por_ultimos_30d,
          por_promedio_anio: crit.por_promedio_anio,
          es_critico: crit.es_critico,
        }
      })
      .filter((c) => c.es_critico)
      .map(({ es_critico: _es, ...c }) => c)
      .sort(
        (a, b) =>
          (a.nombre_promotor ?? "~").localeCompare(b.nombre_promotor ?? "~") ||
          b.rechazos_30d - a.rechazos_30d ||
          b.rechazos_anio - a.rechazos_anio ||
          (a.nombre_cliente ?? "").localeCompare(b.nombre_cliente ?? ""),
      )

    return {
      data: {
        fecha_entrega: header.fecha_entrega,
        generado_at: header.generado_at,
        umbral_30d: UMBRAL_30D,
        umbral_anio: UMBRAL_ANIO,
        total_en_riesgo: (enRiesgo ?? []).length,
        criticos,
        es_vigente,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando críticos" }
  }
}

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

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

/**
 * Última foto del Radar de Rechazos (la del día de entrega más reciente).
 * Devuelve la cabecera + los clientes en riesgo ordenados por riesgo desc.
 * `null` si todavía no se generó ninguna foto.
 */
export async function getRadarRechazos(): Promise<
  { data: RadarView | null } | { error: string }
> {
  try {
    await requireAuth()
    const supa = await createClient()

    const { data: header, error: hErr } = await supa
      .from("radar_rechazos_snapshot")
      .select(
        "id, fecha_entrega, generado_at, total_clientes_dia, total_clientes_riesgo, total_bultos_riesgo, total_monto_riesgo",
      )
      .order("fecha_entrega", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hErr) return { error: hErr.message }
    if (!header) return { data: null }

    const { data: clientes, error: cErr } = await supa
      .from("radar_rechazos_cliente")
      .select(
        "id_cliente, nombre_cliente, localidad, telefono, id_promotor, nombre_promotor, reparto, bultos_pedido, monto_pedido, cerrado_anio, cerrado_mes, sin_dinero_anio, sin_dinero_mes, riesgo_total",
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
        })) as RadarClienteView[],
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el radar" }
  }
}

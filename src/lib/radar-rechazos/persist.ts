/**
 * Persistencia del Radar de Rechazos: congela una foto en
 * `radar_rechazos_snapshot` (cabecera) + `radar_rechazos_cliente` (detalle).
 *
 * Idempotente por fecha de entrega: si ya existe una foto de esa fecha la borra
 * (cascade) y la reescribe, así re-correr el cron no duplica.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { RadarSnapshot } from "./build"

export async function persistRadarSnapshot(
  supabase: SupabaseClient, snap: RadarSnapshot,
): Promise<{ snapshot_id: string; clientes: number }> {
  // 1) Borrar foto previa de la misma fecha (cascade borra el detalle)
  const { error: delErr } = await supabase
    .from("radar_rechazos_snapshot")
    .delete()
    .eq("fecha_entrega", snap.fecha_entrega)
  if (delErr) throw new Error(`delete snapshot previo: ${delErr.message}`)

  // 2) Cabecera
  const { data: header, error: hErr } = await supabase
    .from("radar_rechazos_snapshot")
    .insert({
      fecha_entrega: snap.fecha_entrega,
      total_clientes_dia: snap.total_clientes_dia,
      total_clientes_riesgo: snap.total_clientes_riesgo,
      total_bultos_riesgo: snap.total_bultos_riesgo,
      total_monto_riesgo: snap.total_monto_riesgo,
    })
    .select("id")
    .single()
  if (hErr || !header) throw new Error(`insert cabecera: ${hErr?.message ?? "sin id"}`)

  // 3) Detalle (en chunks por las dudas)
  const rows = snap.clientes.map((c) => ({
    snapshot_id: header.id,
    fecha_entrega: snap.fecha_entrega,
    id_cliente: c.id_cliente,
    nombre_cliente: c.nombre_cliente,
    localidad: c.localidad,
    telefono: c.telefono,
    id_promotor: c.id_promotor,
    nombre_promotor: c.nombre_promotor,
    reparto: c.reparto,
    bultos_pedido: c.bultos_pedido,
    monto_pedido: c.monto_pedido,
    cerrado_anio: c.cerrado_anio,
    cerrado_mes: c.cerrado_mes,
    sin_dinero_anio: c.sin_dinero_anio,
    sin_dinero_mes: c.sin_dinero_mes,
    bultos_rechazados_anio: c.bultos_rechazados_anio,
    riesgo_total: c.riesgo_total,
  }))
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: dErr } = await supabase
      .from("radar_rechazos_cliente")
      .insert(rows.slice(i, i + CHUNK))
    if (dErr) throw new Error(`insert detalle: ${dErr.message}`)
  }

  return { snapshot_id: header.id, clientes: rows.length }
}

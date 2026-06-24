"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getVentasResumenDia as runResumen,
  type VentasResumenDia,
} from "@/lib/ventas/resumen-dia"

export type { VentasResumenDia } from "@/lib/ventas/resumen-dia"

export async function getVentasResumenDia(
  fecha: string,
): Promise<{ data: VentasResumenDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runResumen(supa, fecha)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando resumen de ventas",
    }
  }
}

export interface CamionSkuRow {
  id_articulo: number
  ds_articulo: string
  bultos: number
  hl: number
}

export interface CamionSkuDetalle {
  rows: CamionSkuRow[]
  total_bultos: number
  total_hl: number
}

/**
 * Detalle por SKU de un camión (ds_fletero_carga) en un día, para el modal que
 * se abre al tocar una fila de "Por camión / Por patente" en Ventas del día.
 * Lee ventas_diarias_camion_sku (mig 120) por (fecha, fletero), agregando por
 * SKU por si el fletero tuviera filas en más de un origen.
 */
export async function getVentasCamionSkuDia(
  fecha: string,
  dsFleteroCarga: string,
): Promise<{ data: CamionSkuDetalle } | { error: string }> {
  try {
    await requireAuth()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida (esperado YYYY-MM-DD)" }
    }
    const supa = await createClient()
    const { data, error } = await supa
      .from("ventas_diarias_camion_sku")
      .select("id_articulo, ds_articulo, bultos, hl")
      .eq("fecha", fecha)
      .eq("ds_fletero_carga", dsFleteroCarga)
    if (error) return { error: error.message }

    const agg = new Map<number, CamionSkuRow>()
    for (const r of (data ?? []) as CamionSkuRow[]) {
      const cur =
        agg.get(r.id_articulo) ??
        { id_articulo: r.id_articulo, ds_articulo: r.ds_articulo, bultos: 0, hl: 0 }
      cur.bultos += Number(r.bultos ?? 0)
      cur.hl += Number(r.hl ?? 0)
      if (!cur.ds_articulo && r.ds_articulo) cur.ds_articulo = r.ds_articulo
      agg.set(r.id_articulo, cur)
    }
    const rows = [...agg.values()]
      .map((r) => ({ ...r, hl: Math.round(r.hl * 100) / 100 }))
      .sort((a, b) => b.bultos - a.bultos)
    return {
      data: {
        rows,
        total_bultos: Math.round(rows.reduce((s, r) => s + r.bultos, 0) * 100) / 100,
        total_hl: Math.round(rows.reduce((s, r) => s + r.hl, 0) * 100) / 100,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando detalle del camión",
    }
  }
}

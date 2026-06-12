/**
 * SKUs que llevó un camión/reparto en una fecha (drill del modal "Camiones del día").
 * Lee ventas_diarias_camion_sku (mig 120), alimentada por ambos syncs.
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface CamionSkuRow {
  id_articulo: number
  ds_articulo: string | null
  bultos: number
  hl: number
}

export interface CamionDiaSkus {
  fecha: string
  ds_fletero_carga: string
  total_bultos: number
  total_hl: number
  skus: CamionSkuRow[]
}

export async function getCamionDiaSkus(
  supa: SupaClient,
  fecha: string,
  fletero: string,
): Promise<CamionDiaSkus> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida (esperado YYYY-MM-DD)")
  }
  if (!fletero) throw new Error("Falta el camión/reparto")

  const { data, error } = await supa
    .from("ventas_diarias_camion_sku")
    .select("id_articulo, ds_articulo, bultos, hl")
    .eq("fecha", fecha)
    .eq("ds_fletero_carga", fletero)
    .order("bultos", { ascending: false })

  if (error) throw new Error(`ventas_diarias_camion_sku: ${error.message}`)

  const skus: CamionSkuRow[] = ((data ?? []) as Array<{
    id_articulo: number; ds_articulo: string | null
    bultos: number | null; hl: number | null
  }>).map((r) => ({
    id_articulo: r.id_articulo,
    ds_articulo: r.ds_articulo,
    bultos: Number(r.bultos ?? 0),
    hl: Number(r.hl ?? 0),
  }))

  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    fecha,
    ds_fletero_carga: fletero,
    total_bultos: r2(skus.reduce((s, x) => s + x.bultos, 0)),
    total_hl: r2(skus.reduce((s, x) => s + x.hl, 0)),
    skus,
  }
}

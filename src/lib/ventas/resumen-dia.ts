/**
 * Resumen del día de ventas (bultos + HL) para los drill-downs del tablero
 * de reuniones. Lectura pura: una sola query devuelve ambas métricas para
 * que cualquier dialog (Bultos vendidos / HL vendidos) reuse el resumen.
 */
import type { SupaClient } from "@/lib/rechazos/comparado"

export interface VentasPatenteRow {
  patente: string
  chofer_nombre: string | null
  bultos: number
  hl: number
}

export interface VentasSkuRow {
  id_articulo: number
  ds_articulo: string
  bultos: number
  hl: number
}

export interface VentasOrigenRow {
  origen: "chess" | "gestion"
  bultos: number
  hl: number
  /** SKUs del origen ordenados por bultos desc (de ventas_diarias_sku, mig 108). */
  skus: VentasSkuRow[]
}

export interface VentasResumenDia {
  fecha: string
  total_bultos: number
  total_hl: number
  patentes_con_venta: number
  /** Promedio diario de bultos del mes anterior (Σ bultos / días con datos). */
  promedio_bultos_mes_anterior: number | null
  /** Promedio diario de HL del mes anterior. */
  promedio_hl_mes_anterior: number | null
  /** Patentes ordenadas por bultos desc por default. */
  por_patente: VentasPatenteRow[]
  /** Desglose Chess vs Gestión con detalle por SKU. */
  por_origen: VentasOrigenRow[]
}

export async function getVentasResumenDia(
  supa: SupaClient,
  fecha: string,
): Promise<VentasResumenDia> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Fecha inválida (esperado YYYY-MM-DD)")
  }

  // Rango mes anterior
  const [y, m] = fecha.split("-").map((s) => parseInt(s, 10))
  const prevAnio = m === 1 ? y - 1 : y
  const prevMes = m === 1 ? 12 : m - 1
  const prevDesde = `${prevAnio}-${String(prevMes).padStart(2, "0")}-01`
  const ultimoDia = new Date(Date.UTC(prevAnio, prevMes, 0)).getUTCDate()
  const prevHasta = `${prevAnio}-${String(prevMes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`

  const [ventasRaw, ventasMesAntRaw, mapeoRaw, skusRaw] = await Promise.all([
    supa
      .from("ventas_diarias")
      .select("ds_fletero_carga, total_bultos, total_hl, origen")
      .eq("fecha", fecha),
    supa
      .from("ventas_diarias")
      .select("fecha, total_bultos, total_hl")
      .gte("fecha", prevDesde)
      .lte("fecha", prevHasta),
    supa
      .from("mapeo_patente_chofer")
      .select("patente, catalogo_choferes(nombre)"),
    supa
      .from("ventas_diarias_sku")
      .select("origen, id_articulo, ds_articulo, bultos, hl")
      .eq("fecha", fecha),
  ])

  if (ventasRaw.error) {
    throw new Error(`ventas_diarias: ${ventasRaw.error.message}`)
  }

  type MapeoRow = {
    patente: string
    catalogo_choferes: { nombre: string | null } | null
  }
  const mapeo = (mapeoRaw.data ?? []) as unknown as MapeoRow[]
  const choferIdx = new Map<string, string | null>()
  for (const mp of mapeo) {
    choferIdx.set(mp.patente, mp.catalogo_choferes?.nombre ?? null)
  }

  const ventas = (ventasRaw.data ?? []) as Array<{
    ds_fletero_carga: string
    total_bultos: number | null
    total_hl: number | null
    origen: string | null
  }>

  let totalBultos = 0
  let totalHl = 0
  const porPatenteAgg = new Map<string, { bultos: number; hl: number }>()
  const porOrigenAgg = new Map<string, { bultos: number; hl: number }>()
  for (const v of ventas) {
    const b = Number(v.total_bultos ?? 0)
    const h = Number(v.total_hl ?? 0)
    const bs = Number.isFinite(b) ? b : 0
    const hs = Number.isFinite(h) ? h : 0
    totalBultos += bs
    totalHl += hs
    if (v.ds_fletero_carga) {
      const cur = porPatenteAgg.get(v.ds_fletero_carga) ?? { bultos: 0, hl: 0 }
      cur.bultos += bs
      cur.hl += hs
      porPatenteAgg.set(v.ds_fletero_carga, cur)
    }
    const origen = v.origen === "gestion" ? "gestion" : "chess"
    const co = porOrigenAgg.get(origen) ?? { bultos: 0, hl: 0 }
    co.bultos += bs
    co.hl += hs
    porOrigenAgg.set(origen, co)
  }

  // SKUs por origen (tabla nueva mig 108; si falla la query, desglose vacío)
  const skusPorOrigen = new Map<string, VentasSkuRow[]>()
  if (!skusRaw.error && skusRaw.data) {
    for (const s of skusRaw.data as Array<{
      origen: string; id_articulo: number; ds_articulo: string
      bultos: number | null; hl: number | null
    }>) {
      const origen = s.origen === "gestion" ? "gestion" : "chess"
      const arr = skusPorOrigen.get(origen) ?? []
      arr.push({
        id_articulo: s.id_articulo,
        ds_articulo: s.ds_articulo,
        bultos: Number(s.bultos ?? 0),
        hl: Number(s.hl ?? 0),
      })
      skusPorOrigen.set(origen, arr)
    }
  }
  const por_origen: VentasOrigenRow[] = (["chess", "gestion"] as const)
    .filter((o) => porOrigenAgg.has(o) || (skusPorOrigen.get(o)?.length ?? 0) > 0)
    .map((o) => ({
      origen: o,
      bultos: porOrigenAgg.get(o)?.bultos ?? 0,
      hl: Math.round((porOrigenAgg.get(o)?.hl ?? 0) * 100) / 100,
      skus: (skusPorOrigen.get(o) ?? []).sort((a, b) => b.bultos - a.bultos),
    }))

  // Promedios diarios mes anterior
  let promedioBultos: number | null = null
  let promedioHl: number | null = null
  if (!ventasMesAntRaw.error && ventasMesAntRaw.data) {
    const porFechaBultos = new Map<string, number>()
    const porFechaHl = new Map<string, number>()
    for (const v of ventasMesAntRaw.data as Array<{
      fecha: string
      total_bultos: number | null
      total_hl: number | null
    }>) {
      const b = Number(v.total_bultos ?? 0)
      const h = Number(v.total_hl ?? 0)
      if (Number.isFinite(b)) {
        porFechaBultos.set(v.fecha, (porFechaBultos.get(v.fecha) ?? 0) + b)
      }
      if (Number.isFinite(h)) {
        porFechaHl.set(v.fecha, (porFechaHl.get(v.fecha) ?? 0) + h)
      }
    }
    if (porFechaBultos.size > 0) {
      let s = 0
      for (const b of porFechaBultos.values()) s += b
      promedioBultos = s / porFechaBultos.size
    }
    if (porFechaHl.size > 0) {
      let s = 0
      for (const h of porFechaHl.values()) s += h
      promedioHl = s / porFechaHl.size
    }
  }

  const por_patente: VentasPatenteRow[] = [...porPatenteAgg.entries()]
    .map(([patente, agg]) => ({
      patente,
      chofer_nombre: choferIdx.get(patente) ?? null,
      bultos: agg.bultos,
      hl: agg.hl,
    }))
    .sort((a, b) => b.bultos - a.bultos)

  return {
    fecha,
    total_bultos: totalBultos,
    total_hl: Math.round(totalHl * 100) / 100,
    patentes_con_venta: porPatenteAgg.size,
    promedio_bultos_mes_anterior: promedioBultos,
    promedio_hl_mes_anterior: promedioHl,
    por_patente,
    por_origen,
  }
}

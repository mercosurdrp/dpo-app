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
  /** Camiones del origen ordenados por bultos desc. Chess = patente real;
   *  Gestión = reparto GESTION-<codigoChofer> (GESCOM no informa patente). */
  patentes: VentasPatenteRow[]
  /** SKUs del origen ordenados por bultos desc (de ventas_diarias_sku, mig 108). */
  skus: VentasSkuRow[]
}

export interface VentasClienteOrigenRow {
  origen: "chess" | "gestion"
  ds_fletero_carga: string
  patente: string | null
  bultos: number
  hl: number
}

export interface VentasClienteRow {
  id_cliente: number
  nombre_cliente: string | null
  bultos: number
  hl: number
  comprobantes: number
  /** Detalle por origen/camión del cliente ese día (mig 119). */
  origenes: VentasClienteOrigenRow[]
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
  /** Clientes del día ordenados por bultos desc (de ventas_diarias_cliente, mig 119). */
  por_cliente: VentasClienteRow[]
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

  const [ventasRaw, ventasMesAntRaw, mapeoRaw, skusRaw, mapeoGescomRaw, clientesRaw] = await Promise.all([
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
    supa
      .from("mapeo_chofer_gescom")
      .select("codigo, nombre")
      .eq("activo", true),
    supa
      .from("ventas_diarias_cliente")
      .select("origen, ds_fletero_carga, patente, id_cliente, nombre_cliente, comprobantes, bultos, hl")
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

  // Choferes de Gestión: la "patente" es GESTION-<codigo>; el nombre sale de mapeo_chofer_gescom.
  if (!mapeoGescomRaw.error && mapeoGescomRaw.data) {
    for (const mg of mapeoGescomRaw.data as Array<{ codigo: string; nombre: string }>) {
      choferIdx.set(`GESTION-${mg.codigo}`, mg.nombre)
    }
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
  const porOrigenPatenteAgg = new Map<string, Map<string, { bultos: number; hl: number }>>()
  for (const v of ventas) {
    const b = Number(v.total_bultos ?? 0)
    const h = Number(v.total_hl ?? 0)
    const bs = Number.isFinite(b) ? b : 0
    const hs = Number.isFinite(h) ? h : 0
    totalBultos += bs
    totalHl += hs
    const origen = v.origen === "gestion" ? "gestion" : "chess"
    if (v.ds_fletero_carga) {
      const cur = porPatenteAgg.get(v.ds_fletero_carga) ?? { bultos: 0, hl: 0 }
      cur.bultos += bs
      cur.hl += hs
      porPatenteAgg.set(v.ds_fletero_carga, cur)
      const porPat = porOrigenPatenteAgg.get(origen) ?? new Map()
      const curO = porPat.get(v.ds_fletero_carga) ?? { bultos: 0, hl: 0 }
      curO.bultos += bs
      curO.hl += hs
      porPat.set(v.ds_fletero_carga, curO)
      porOrigenPatenteAgg.set(origen, porPat)
    }
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
  // Unificado: todo se presenta como un solo origen "chess" (Chess+Gestión
  // sumados). Internamente la data sigue separada por origen; acá se combinan
  // bultos, HL, camiones y SKUs en una sola entrada para no exponer "Gestión".
  const combBultos = [...porOrigenAgg.values()].reduce((s, c) => s + c.bultos, 0)
  const combHl = [...porOrigenAgg.values()].reduce((s, c) => s + c.hl, 0)
  const combPatentes: VentasPatenteRow[] = []
  for (const porPat of porOrigenPatenteAgg.values()) {
    for (const [patente, agg] of porPat.entries()) {
      combPatentes.push({ patente, chofer_nombre: choferIdx.get(patente) ?? null, bultos: agg.bultos, hl: agg.hl })
    }
  }
  combPatentes.sort((a, b) => b.bultos - a.bultos)
  const combSkus = new Map<number, VentasSkuRow>()
  for (const arr of skusPorOrigen.values()) {
    for (const s of arr) {
      const cur = combSkus.get(s.id_articulo) ?? { id_articulo: s.id_articulo, ds_articulo: s.ds_articulo, bultos: 0, hl: 0 }
      cur.bultos += s.bultos
      cur.hl += s.hl
      combSkus.set(s.id_articulo, cur)
    }
  }
  const por_origen: VentasOrigenRow[] =
    combBultos !== 0 || combHl !== 0 || combPatentes.length > 0 || combSkus.size > 0
      ? [{
          origen: "chess",
          bultos: combBultos,
          hl: Math.round(combHl * 100) / 100,
          patentes: combPatentes,
          skus: [...combSkus.values()].sort((a, b) => b.bultos - a.bultos),
        }]
      : []

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

  // Clientes del día (tabla mig 119; si falla la query, sección vacía)
  const porClienteAgg = new Map<number, VentasClienteRow>()
  if (!clientesRaw.error && clientesRaw.data) {
    for (const c of clientesRaw.data as Array<{
      origen: string; ds_fletero_carga: string; patente: string | null
      id_cliente: number; nombre_cliente: string | null
      comprobantes: number | null; bultos: number | null; hl: number | null
    }>) {
      const cur = porClienteAgg.get(c.id_cliente) ?? {
        id_cliente: c.id_cliente,
        nombre_cliente: c.nombre_cliente,
        bultos: 0,
        hl: 0,
        comprobantes: 0,
        origenes: [],
      }
      const b = Number(c.bultos ?? 0)
      const h = Number(c.hl ?? 0)
      cur.bultos += b
      cur.hl += h
      cur.comprobantes += Number(c.comprobantes ?? 0)
      if (!cur.nombre_cliente && c.nombre_cliente) cur.nombre_cliente = c.nombre_cliente
      cur.origenes.push({
        origen: c.origen === "gestion" ? "gestion" : "chess",
        ds_fletero_carga: c.ds_fletero_carga,
        patente: c.patente,
        bultos: b,
        hl: h,
      })
      porClienteAgg.set(c.id_cliente, cur)
    }
  }
  const por_cliente = [...porClienteAgg.values()].sort((a, b) => b.bultos - a.bultos)

  return {
    fecha,
    total_bultos: totalBultos,
    total_hl: Math.round(totalHl * 100) / 100,
    patentes_con_venta: porPatenteAgg.size,
    promedio_bultos_mes_anterior: promedioBultos,
    promedio_hl_mes_anterior: promedioHl,
    por_patente,
    por_origen,
    por_cliente,
  }
}

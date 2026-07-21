/**
 * Regla única del costo de una Orden de Trabajo, compartida por el formulario,
 * el detalle y el reporte de costos, para que los tres den el mismo número.
 *
 * Total OT = mano de obra + facturas de repuestos + repuestos sueltos
 *
 * Donde cada factura vale su `monto_total` si está cargado —y ahí sus líneas son
 * detalle informativo, no se suman— o la suma de sus líneas si está vacío. Los
 * repuestos sueltos (sin factura) son los de la carga vieja y suman siempre.
 */

export interface LineaRepuestoCosto {
  cantidad: number | string | null
  costo_unitario: number | string | null
  factura_id?: string | null
}

export interface FacturaCosto {
  id: string
  monto_total: number | string | null
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Σ (cantidad × costo unitario) de las líneas dadas. */
export function subtotalLineas(lineas: LineaRepuestoCosto[]): number {
  return lineas.reduce((a, r) => {
    const cant = num(r.cantidad) || 1
    return a + cant * num(r.costo_unitario)
  }, 0)
}

/** Monto de una factura: el total cargado a mano, o la suma de sus líneas. */
export function montoFactura(factura: FacturaCosto, lineas: LineaRepuestoCosto[]): number {
  if (factura.monto_total != null) return num(factura.monto_total)
  return subtotalLineas(lineas.filter((l) => l.factura_id === factura.id))
}

/** Σ de todas las facturas de repuestos + los repuestos sin factura. */
export function totalRepuestos(
  facturas: FacturaCosto[],
  lineas: LineaRepuestoCosto[]
): number {
  const deFacturas = facturas.reduce((a, f) => a + montoFactura(f, lineas), 0)
  const sueltos = subtotalLineas(lineas.filter((l) => !l.factura_id))
  return deFacturas + sueltos
}

/** Total de la OT = mano de obra + repuestos (facturados y sueltos). */
export function totalOrdenTrabajo(
  costoManoObra: number | string | null,
  facturas: FacturaCosto[],
  lineas: LineaRepuestoCosto[]
): number {
  return num(costoManoObra) + totalRepuestos(facturas, lineas)
}

// Etiquetas, colores y formatos de las órdenes de trabajo.
// Compartidos por la solapa de OT (mantenimiento general) y la de Neumáticos,
// que muestra las OT de cubiertas.

import type {
  MantenimientoEstado,
  MantenimientoRealizado,
  MantenimientoTipo,
} from "@/types/database"

export const TIPO_MANT_LABEL: Record<MantenimientoTipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  proactivo: "Proactivo",
}

export const TIPO_MANT_BADGE: Record<MantenimientoTipo, string> = {
  preventivo: "border-sky-200 bg-sky-50 text-sky-700",
  correctivo: "border-orange-200 bg-orange-50 text-orange-700",
  proactivo: "border-violet-200 bg-violet-50 text-violet-700",
}

export const ESTADO_MANT_BADGE: Record<MantenimientoEstado, string> = {
  programado: "bg-blue-100 text-blue-700",
  en_taller: "bg-amber-100 text-amber-700",
  completado: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-muted text-muted-foreground",
}

export function fmtFechaOt(f: string | null): string {
  if (!f) return "—"
  return f.slice(0, 10).split("-").reverse().join("/")
}

/** Fecha + hora legible (para entrada/salida del taller). */
export function fmtFechaHoraOt(f: string | null): string {
  if (!f) return "—"
  const d = new Date(f)
  if (isNaN(d.getTime())) return fmtFechaOt(f)
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const fmtMoneyOt = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v)

export const fmtNumOt = (v: number) => new Intl.NumberFormat("es-AR").format(v)

/**
 * Costo total de una OT = mayor entre el costo de cabecera y el desglose
 * (tareas + mano de obra + repuestos).
 *
 * 🚨 Si la suma de las tareas coincide con `costo_mano_obra`, es LA MISMA PLATA
 * y se cuenta una sola vez. El sync de Cloudfleet carga cada *labor* como una
 * tarea con su costo Y además su total en `costo_mano_obra`
 * (`work-orders-sync.ts`), así que sumar las dos cosas duplicaba la mano de
 * obra: 59 OT (56 de Cloudfleet y 3 cargadas a mano con el mismo número en los
 * dos campos) inflaban el gasto de la flota en $25,4 M — la OT 1507 del TOYOTA3
 * figuraba $15,2 M cuando la factura es de $8,29 M. La cabecera (`totalCost` en
 * Cloudfleet) es el total correcto en los 59 casos.
 */
export function costoTotalOt(m: MantenimientoRealizado): number {
  const tareas = (m.tareas ?? []).reduce((a, t) => a + Number(t.costo || 0), 0)
  const repuestos = (m.repuestos ?? []).reduce(
    (a, r) => a + Number(r.cantidad || 1) * Number(r.costo_unitario || 0),
    0
  )
  const manoObra = Number(m.costo_mano_obra || 0)
  // Tolerancia de $1 por el redondeo de los decimales que vienen de la API.
  const duplicada = tareas > 0 && Math.abs(tareas - manoObra) < 1
  const desglosado = tareas + (duplicada ? 0 : manoObra) + repuestos
  return Math.max(Number(m.costo || 0), desglosado)
}

export function nombreArchivoDeUrl(url: string): string {
  try {
    const last = url.split("/").pop() || "archivo"
    return decodeURIComponent(last.replace(/^\d+-\d+-/, ""))
  } catch {
    return "archivo"
  }
}

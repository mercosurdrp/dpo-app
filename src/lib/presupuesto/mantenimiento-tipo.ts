/**
 * Tipos, constantes y agregaciones del gasto de mantenimiento por tipo
 * (preventivo / correctivo / proactivo) que muestra /presupuesto con el
 * filtro en el pilar Flota.
 *
 * Sin "use server": lo importan tanto la action que lee la DB como el
 * componente cliente que dibuja (un archivo "use server" no puede exportar
 * constantes a client components).
 */
import type { MantenimientoTipo } from "@/types/database"

export const TIPOS_MANTENIMIENTO: MantenimientoTipo[] = [
  "preventivo",
  "correctivo",
  "proactivo",
]

export const TIPO_MANTENIMIENTO_LABEL: Record<MantenimientoTipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  proactivo: "Proactivo",
}

/** Mismos colores que los badges de /vehiculos/mantenimiento. */
export const TIPO_MANTENIMIENTO_COLOR: Record<MantenimientoTipo, string> = {
  preventivo: "#0284c7", // sky-600
  correctivo: "#ea580c", // orange-600
  proactivo: "#7c3aed", // violet-600
}

export const TIPO_MANTENIMIENTO_BADGE: Record<MantenimientoTipo, string> = {
  preventivo: "border-sky-200 bg-sky-50 text-sky-700",
  correctivo: "border-orange-200 bg-orange-50 text-orange-700",
  proactivo: "border-violet-200 bg-violet-50 text-violet-700",
}

/** Una fila por (mes, unidad, tipo): lo que devuelve la action. */
export interface MantenimientoTipoFila {
  /** 1-12 */
  mes: number
  dominio: string
  tipo: MantenimientoTipo
  /** $ sumados de las OT con costo cargado. */
  costo: number
  /** Cantidad de OT (con y sin costo). */
  ot: number
  /** OT sin costo cargado: su gasto no está en `costo`. */
  sinCosto: number
}

export interface MantenimientoPorTipo {
  anio: number
  filas: MantenimientoTipoFila[]
  /** Último mes con alguna OT; 0 si no hay ninguna en el año. */
  ultimoMes: number
  totalOt: number
}

export interface AgregadoTipo {
  costo: Record<MantenimientoTipo, number>
  ot: Record<MantenimientoTipo, number>
  total: number
  totalOt: number
  sinCosto: number
}

export interface AgregadoMes extends AgregadoTipo {
  mes: number
}

export interface AgregadoDominio extends AgregadoTipo {
  dominio: string
}

export function cerosPorTipo(): Record<MantenimientoTipo, number> {
  return { preventivo: 0, correctivo: 0, proactivo: 0 }
}

export function esTipoMantenimiento(t: string): t is MantenimientoTipo {
  return (TIPOS_MANTENIMIENTO as string[]).includes(t)
}

function agregadoVacio(): AgregadoTipo {
  return { costo: cerosPorTipo(), ot: cerosPorTipo(), total: 0, totalOt: 0, sinCosto: 0 }
}

function sumar(a: AgregadoTipo, f: MantenimientoTipoFila) {
  a.costo[f.tipo] += f.costo
  a.ot[f.tipo] += f.ot
  a.total += f.costo
  a.totalOt += f.ot
  a.sinCosto += f.sinCosto
}

/** Los 12 meses, con ceros donde no hubo OT. */
export function agregarPorMes(filas: MantenimientoTipoFila[]): AgregadoMes[] {
  const meses: AgregadoMes[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    ...agregadoVacio(),
  }))
  for (const f of filas) {
    if (f.mes >= 1 && f.mes <= 12) sumar(meses[f.mes - 1], f)
  }
  return meses
}

/** Total de un período (lista de meses). */
export function agregarPeriodo(
  filas: MantenimientoTipoFila[],
  meses: number[],
): AgregadoTipo {
  const set = new Set(meses)
  const a = agregadoVacio()
  for (const f of filas) if (set.has(f.mes)) sumar(a, f)
  return a
}

/** Por unidad dentro de un período, ordenado por correctivo descendente. */
export function agregarPorDominio(
  filas: MantenimientoTipoFila[],
  meses: number[],
): AgregadoDominio[] {
  const set = new Set(meses)
  const map = new Map<string, AgregadoDominio>()
  for (const f of filas) {
    if (!set.has(f.mes)) continue
    let d = map.get(f.dominio)
    if (!d) {
      d = { dominio: f.dominio, ...agregadoVacio() }
      map.set(f.dominio, d)
    }
    sumar(d, f)
  }
  return [...map.values()].sort(
    (a, b) => b.costo.correctivo - a.costo.correctivo || b.total - a.total,
  )
}

/** Porcentaje correctivo sobre el total con costo; null si no hay gasto. */
export function pctCorrectivo(a: AgregadoTipo): number | null {
  if (a.total <= 0) return null
  return (a.costo.correctivo / a.total) * 100
}

/**
 * Rubros del EERR que son mantenimiento de la flota: reparación y
 * mantenimiento de rodados / autoelevadores / vehículos, neumáticos y stock
 * de taller. Con ellos se muestra el presupuestado vs real del EERR al lado
 * de la estratificación por tipo de las OT. Quedan afuera combustible,
 * seguros, patentes, etc.: son gasto de flota pero no de mantenimiento.
 */
export function esRubroMantenimientoFlota(rubro: string): boolean {
  const r = rubro
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
  // Tiene que decir de qué: el EERR trae «REPARACIONES Y MANTENIMIENTO» a secas
  // (edilicio / genérico) y «MANTENIMIENTO DE SISTEMAS» (software), que no son flota.
  if (/NEUMATIC|STOCK DE TALLER/.test(r)) return true
  return /(REPARACI|MANTENIMIENTO|MTTO).*(RODADO|AUTOELEVADOR|VEHICUL|CAMION)/.test(r)
}

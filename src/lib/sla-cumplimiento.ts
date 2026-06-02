// Constantes y tipos del cumplimiento de SLA.
// 🚨 Viven fuera de actions/sla.ts porque ese archivo es "use server" y un
// módulo de Server Actions SOLO puede exportar funciones async (Turbopack
// rechaza exportar constantes/tipos desde ahí, aunque tsc no lo marque).

export const SLA_RUTEO_NOMBRE = "Tiempo de finalización del ruteo"
export const SLA_RUTEO_TARGET = 95

export const SLA_SYOP_NOMBRE = "Ventas ↔ Operaciones (entrega de preventa)"
export const SLA_SYOP_TARGET = 95

export const SLA_CAPACIDAD_NOMBRE = "Capacidad del camión (ocupación)"
export const SLA_CAPACIDAD_TARGET = 95

export const SLA_PUSHED_NOMBRE = "Volumen no ruteado (Pushed)"
export const SLA_PUSHED_TARGET = 95

// --- Umbrales DIARIOS configurables ------------------------------------------
/** Un día cumple capacidad si el % de ocupación promedio (CEq/450) ≥ este valor. */
export const CAPACIDAD_MIN_PCT = 90
/** Un día cumple pushed si bultos no ruteados ÷ total ≤ este valor (en %). */
export const PUSHED_MAX_PCT = 5

// Estado de un día para un SLA:
//   "si" = cumple · "no" = no cumple · "na" = no aplica (ej. domingo) ·
//   "sd" = sin dato (día futuro o ruteo no cerrado)
export type EstadoCumplimiento = "si" | "no" | "na" | "sd"

export interface CumplimientoSlaFila {
  codigo: string
  nombre: string
  target: number
  porcentaje: number | null // % de cumplimiento del mes
  cumplidos: number
  totalAplica: number // denominador (días medibles del mes)
  /** Estado por día del mes; índice 0 = día 1. Largo = días del mes. */
  dias: EstadoCumplimiento[]
}

export interface CumplimientoMes {
  year: number
  month: number
  diasDelMes: number // 28..31
  filas: CumplimientoSlaFila[]
}

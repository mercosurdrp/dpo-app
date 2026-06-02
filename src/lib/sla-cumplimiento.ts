// Constantes y tipos del cumplimiento de SLA.
// 🚨 Viven fuera de actions/sla.ts porque ese archivo es "use server" y un
// módulo de Server Actions SOLO puede exportar funciones async (Turbopack
// rechaza exportar constantes/tipos desde ahí, aunque tsc no lo marque).

export const SLA_RUTEO_NOMBRE = "Tiempo de finalización del ruteo"
export const SLA_RUTEO_TARGET = 95

export const SLA_SYOP_NOMBRE = "Ventas ↔ Operaciones (entrega de preventa)"
export const SLA_SYOP_TARGET = 95

export const SLA_CAPACIDAD_NOMBRE = "Cumplimiento de capacidad del camión"
export const SLA_CAPACIDAD_TARGET = 95

export const SLA_PUSHED_NOMBRE = "Volumen no ruteado (Pushed)"
export const SLA_PUSHED_TARGET = 95

// --- Umbrales DIARIOS configurables ------------------------------------------
/**
 * Un día cumple capacidad si la ocupación promedio (CEq/TARGET_CEQ × 100) ≥
 * este valor. Con TARGET_CEQ = 525, un 100% equivale a "promedio de CEq ≥ 525"
 * (el mínimo de carga pactado en el SLA, sin máximo).
 */
export const CAPACIDAD_MIN_PCT = 100

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
  /**
   * Si está presente, la columna MTD muestra este texto (acumulado informativo,
   * ej. "47 bultos") en vez del % — para SLA de procedimiento como el de
   * volumen no ruteado, cuyo cumplimiento es siempre "Sí".
   */
  mtdLabel?: string
}

export interface CumplimientoMes {
  year: number
  month: number
  diasDelMes: number // 28..31
  filas: CumplimientoSlaFila[]
}

/** Detalle de un día/SLA para el modal al hacer clic en una celda. */
export interface DetalleDiaSla {
  codigo: string
  nombre: string
  fecha: string // YYYY-MM-DD
  diaSemana: string // "Lunes".."Domingo"
  estado: EstadoCumplimiento
  metaLabel: string // ej. "Límite ≤ 09:00", "Ocupación ≥ 90%", "No ruteado ≤ 5%"
  valorLabel: string // ej. "08:47", "92%", "3,2%"
  /** Desglose adicional (por patente, horarios, bultos, etc.). */
  filas: { label: string; valor: string }[]
  nota?: string // mensaje cuando es "sin dato" o "no aplica"
}

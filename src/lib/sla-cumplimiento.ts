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

export const SLA_RECEPCION_NOMBRE = "Recepción de abastecimiento (acarreos)"
export const SLA_RECEPCION_TARGET = 95

export const SLA_CARGA_NOMBRE = "SLA de carga (reducir retrasos)"
export const SLA_CARGA_TARGET = 95
// Hora límite ARG de carga: todos los camiones ruteados el día D deben quedar
// cargados antes de las 07:00 del día de reparto (D+1). El blob de carga trae
// fecha ('YYYY-MM-DD') y hora ('HH:mm:ss') ya en hora Argentina, así que el
// corte se compara directo por string.
export const CARGA_LIMITE_HORA = "07:00:00"

// --- SLA #7 recepción: ventana de arribo + tiempo de descarga --------------
// La recepción opera 07:00–17:00, pero el cumplimiento de descarga ≤ 3 h se
// EXIGE solo a los arribos dentro de la ventana 08:00–16:00 (ARG). Los arribos
// fuera de esa franja no se computan en el SLA (cumpleRecepcion → null).
export const RECEPCION_VENTANA_INICIO_MIN = 8 * 60 // 08:00
export const RECEPCION_VENTANA_FIN_MIN = 16 * 60 // 16:00
export const RECEPCION_MAX_DESCARGA_MIN = 180 // ≤ 3 h

/** Minutos desde medianoche en hora Argentina (UTC-3 fijo, sin DST). */
function minutosArgentina(iso: string): number {
  const arg = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000)
  return arg.getUTCHours() * 60 + arg.getUTCMinutes()
}

/**
 * Cumplimiento de una recepción para el SLA #7. Devuelve:
 *   true  → arribo en ventana 08:00–16:00 y descarga ≤ 3 h
 *   false → arribo en ventana pero descarga > 3 h
 *   null  → no evaluable (sin fin de descarga o arribo fuera de 08:00–16:00)
 */
export function cumpleRecepcion(arriboIso: string, finIso: string | null): boolean | null {
  const min = minutosArgentina(arriboIso)
  if (min < RECEPCION_VENTANA_INICIO_MIN || min >= RECEPCION_VENTANA_FIN_MIN) return null
  if (!finIso) return null
  const dur = (new Date(finIso).getTime() - new Date(arriboIso).getTime()) / 60000
  return dur <= RECEPCION_MAX_DESCARGA_MIN
}

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
  /** Comentario/justificativo cargado en /ruteo (fin de preventa o cierre). */
  comentario?: string | null
}

// ── Cumplimiento por rango de fechas (para la Reunión Ventas-Logística) ──
export interface CumplimientoRangoFila {
  codigo: string
  nombre: string
  target: number
  porcentaje: number | null // % en el rango (cumplidos / días que aplican)
  cumplidos: number
  totalAplica: number
  dias: { fecha: string; estado: EstadoCumplimiento }[]
}

export interface CumplimientoRango {
  desde: string
  hasta: string
  filas: CumplimientoRangoFila[]
}

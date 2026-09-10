// Tasa de respuesta de la encuesta RMD: de las entregas encuestadas, cuántas
// vuelven calificadas. Acá viven el foco que identifica a los planes que la
// atacan y el objetivo que esos planes persiguen.

/** Foco (`foco_motivo`) de los planes de acción que atacan la tasa de respuesta. */
export const TASA_FOCO = "Tasa de respuesta"

/**
 * Objetivo del plan de acción: que al menos el 50 % de las entregas
 * encuestadas vuelvan con nota. Se mide sobre los meses cerrados del año
 * (el mes abierto todavía suma puntuaciones). Definido el 10/09/2026.
 */
export const RMD_TASA_OBJETIVO = 50

/** Cuántos puntos porcentuales faltan para el objetivo (0 si ya se llegó). */
export function brechaTasa(tasa: number | null): number | null {
  if (tasa == null) return null
  return Math.max(0, RMD_TASA_OBJETIVO - tasa)
}

/**
 * Calificaciones que hubieran hecho falta, sobre las entregas encuestadas
 * dadas, para llegar al objetivo. 0 si ya se llegó.
 */
export function calificacionesFaltantes(
  enviadas: number,
  puntuadas: number,
): number {
  const necesarias = Math.ceil((enviadas * RMD_TASA_OBJETIVO) / 100)
  return Math.max(0, necesarias - puntuadas)
}

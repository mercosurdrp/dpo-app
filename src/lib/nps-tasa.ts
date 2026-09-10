// Tasa de respuesta de la encuesta NPS: de las encuestas enviadas, cuántas
// vuelven respondidas. Acá viven el foco que identifica a los planes que la
// atacan y el objetivo que esos planes persiguen. Espejo de rmd-tasa.ts.

/** Foco (`foco_driver`) de los planes de acción que atacan la tasa de respuesta. */
export const TASA_FOCO = "Tasa de respuesta"

/**
 * Objetivo del plan de acción: porcentaje de encuestas enviadas que tienen
 * que volver respondidas. Se mide sobre los meses cerrados del año (el mes
 * en curso viene incompleto del Power BI). Definido el 10/09/2026.
 */
export const NPS_TASA_OBJETIVO = 30

/** Cuántos puntos porcentuales faltan para el objetivo (0 si ya se llegó). */
export function brechaTasaNps(tasa: number | null): number | null {
  if (tasa == null) return null
  return Math.max(0, NPS_TASA_OBJETIVO - tasa)
}

/**
 * Respuestas que hubieran hecho falta, sobre las encuestas enviadas dadas,
 * para llegar al objetivo. 0 si ya se llegó.
 */
export function respuestasFaltantesNps(
  enviadas: number,
  respondidas: number,
): number {
  const necesarias = Math.ceil((enviadas * NPS_TASA_OBJETIVO) / 100)
  return Math.max(0, necesarias - respondidas)
}

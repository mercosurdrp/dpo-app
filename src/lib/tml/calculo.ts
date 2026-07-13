/**
 * Cálculo del TML (Tiempo Medio de Liberación) — Pampeana.
 * Única fuente de verdad: antes esta fórmula estaba duplicada en los dos forms
 * de carga (TML y portería) y en las dos server actions, y divergían.
 */

export const TML_META_MINUTOS = 25

/** Franja de entrada del turno. La liberación se mide contra esta hora. */
export type FranjaEntrada = 6 | 7

/**
 * El turno arranca 06:00 o 07:00. Un camión que sale antes de las 07:00
 * pertenece al turno de las 06:00 — cargarlo en la franja 07 daba TML negativos.
 */
export function franjaPorHoraSalida(hora: string): FranjaEntrada {
  const [h] = hora.split(":").map(Number)
  return Number.isFinite(h) && h < 7 ? 6 : 7
}

/**
 * Minutos entre la entrada del turno y la salida del camión.
 * Nunca negativo: salir antes de que arranque el turno no es una demora negativa,
 * es cero demora. Un valor negativo además pasaba el filtro `tml <= META` y se
 * contaba como "dentro de meta", inflando el cumplimiento.
 */
export function calcTml(hora: string, horaEntrada: number): number {
  const [h, m] = hora.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.max(0, h * 60 + m - horaEntrada * 60)
}

/**
 * Los <Select> de los forms usan "SIN AYUDANTE" como centinela y deberían
 * filtrarlo antes de guardar, pero si alguno se persiste hay que ignorarlo:
 * si no, cuenta como una persona más en el FTE.
 */
export function esAyudante(nombre: string | null | undefined): boolean {
  if (!nombre) return false
  const t = nombre.trim().toUpperCase()
  return t.length > 0 && t !== "SIN AYUDANTE"
}

/** Personas arriba del camión: chofer + ayudantes efectivamente cargados. */
export function contarTripulacion(r: {
  ayudante1?: string | null
  ayudante2?: string | null
}): number {
  return 1 + (esAyudante(r.ayudante1) ? 1 : 0) + (esAyudante(r.ayudante2) ? 1 : 0)
}

// Lógica de turnos y tardanza para el sector Depósito (operadores de almacén).
//
// Problema que resuelve:
//   1) Las marcas de asistencia están guardadas con timezone INCONSISTENTE. Las
//      cargas "en vivo" del reloj quedaron en hora Argentina etiquetada como UTC
//      (el desfase created_at - fecha_marca es ≈ 3-4,5h, no minutos). Algunas
//      recargas históricas están en UTC verdadero. Interpretar todo igual corre
//      las horas 3h y genera tardanzas falsas/perdidas.
//   2) Los operadores de depósito NO entran todos a las 7:00. La mayoría entra a
//      las 9:00; Cerbin entra a las 7:00; Sala y Veidoski rotan semanalmente entre
//      turno 7 y turno 9. Un umbral fijo de 7:00 marca tardanza a casi todos.
//
// Criterio (acordado con el usuario):
//   - El turno esperado se INFIERE de la propia marca: con corte a las 08:00,
//     entrada antes => turno 7, entrada a las 08:00 o después => turno 9.
//   - Tolerancia de 1 minuto sobre la hora del turno.

interface MarcaTZ {
  fecha_marca: string
  created_at?: string | null
}

/**
 * Hora Argentina (decimal, ej. 8.5 = 08:30) de una marca, resolviendo el
 * timezone inconsistente entre cargas en vivo y recargas históricas.
 */
export function horaArgDecimal(fechaMarca: string, createdAt?: string | null): number {
  const dt = new Date(fechaMarca)
  // Interpretación A: el valor es hora AR etiquetada como UTC (no restar).
  const crudo = dt.getUTCHours() + dt.getUTCMinutes() / 60
  // Interpretación B: el valor es UTC verdadero (restar 3 para llevar a AR).
  const utc = (crudo - 3 + 24) % 24

  if (createdAt) {
    const delay = (new Date(createdAt).getTime() - dt.getTime()) / 3_600_000
    // Carga en vivo (~3-4,5h de desfase): hora AR etiquetada como UTC.
    if (delay >= 2.5 && delay <= 5) return crudo
    // Carga en vivo en UTC verdadero (desfase de minutos): restar 3.
    if (delay >= 0 && delay < 2.5) return utc
  }

  // Recarga histórica (o sin created_at): el desfase no sirve para desambiguar.
  // Entre las dos interpretaciones, elegir la más cercana a un turno de ingreso
  // típico (07:00 o 09:00); así una recarga en UTC verdadero (ej. 11:56 = 08:56)
  // no se confunde con una entrada de las 11:56.
  const distTurno = (h: number) => Math.min(Math.abs(h - 7), Math.abs(h - 9))
  return distTurno(utc) < distTurno(crudo) ? utc : crudo
}

/**
 * Hora Argentina (decimal) de la ENTRADA real del día a partir de las marcas "E".
 * Descarta salidas mal tipeadas como "E" y duplicados quedándose con la marca
 * más temprana dentro de la ventana de ingreso plausible (05:00–12:00 AR).
 * Devuelve null si no hay ninguna marca de entrada razonable.
 */
export function entradaRealArg(marcasEntrada: MarcaTZ[]): number | null {
  const horas = marcasEntrada
    .map((m) => horaArgDecimal(m.fecha_marca, m.created_at))
    .filter((h) => h >= 5 && h <= 12)
  if (horas.length === 0) return null
  return Math.min(...horas)
}

/** Turno esperado (7 o 9) inferido de la hora de entrada. Corte a las 08:00. */
export function turnoInferido(entradaArg: number): 7 | 9 {
  return entradaArg < 8 ? 7 : 9
}

const TOLERANCIA_MIN = 1 / 60 // 1 minuto

/**
 * ¿La entrada del día es tardanza para un operador de depósito?
 * Infiere el turno (7 o 9) y compara contra la hora del turno + 1 minuto.
 * Devuelve false si no hubo entrada razonable.
 */
export function esTardanzaDeposito(marcasEntrada: MarcaTZ[]): boolean {
  const entrada = entradaRealArg(marcasEntrada)
  if (entrada === null) return false
  const turno = turnoInferido(entrada)
  return entrada > turno + TOLERANCIA_MIN
}

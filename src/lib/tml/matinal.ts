/**
 * TML desde matinal — serie paralela en evaluación (H2 2026).
 *
 * Inicio: check-in a la Reunión Pre-Ruta (`reunion_preruta.hora_checkin`,
 * timestamp de servidor en UTC real). Fin: el mismo egreso de portería que usa
 * el TML oficial. Se calcula SIEMPRE en lectura: no persiste nada y el TML
 * oficial (franja 6/7 → `tml_minutos`) queda intacto como serie histórica.
 */

const AR_TZ = "America/Argentina/Buenos_Aires"
const horaARFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
  timeZone: AR_TZ,
})

/** Minutos desde medianoche de un TIME "HH:MM[:SS]" de portería (hora AR). */
function minutosDeHora(hora: string): number | null {
  const [h, m] = hora.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/**
 * Minutos entre el check-in matinal y la salida del camión.
 *
 * Devuelve null si el check-in quedó DESPUÉS de la salida: un chofer que marca
 * la asistencia tarde (o la toca a cualquier hora, no hay validación horaria en
 * el módulo) no representa "cero demora" — es dato inválido, y clampearlo a 0
 * inflaría el cumplimiento de la serie igual que pasaba con los TML negativos.
 */
export function calcTmlMatinal(
  horaSalida: string,
  horaCheckinIso: string,
): number | null {
  const salidaMin = minutosDeHora(horaSalida)
  if (salidaMin == null) return null
  const checkin = new Date(horaCheckinIso)
  if (isNaN(checkin.getTime())) return null
  const checkinMin = minutosDeHora(horaARFormatter.format(checkin))
  if (checkinMin == null) return null
  const diff = salidaMin - checkinMin
  return diff < 0 ? null : diff
}

export function normalizaNombre(s: string): string {
  return s.trim().toUpperCase()
}

/** "HH:MM" en hora argentina de un timestamp UTC real (ej. hora_checkin). */
export function horaARDeIso(iso: string): string | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return horaARFormatter.format(d)
}

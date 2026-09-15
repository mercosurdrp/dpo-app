/**
 * Calendario de la Reunión de Presupuesto (regla_especial = 'quincena_2').
 *
 * Dos encuentros por mes:
 *   1) Primer día hábil a partir del 16 (si el 16 cae sáb/dom → lunes): se
 *      revisan los desvíos del cierre del mes anterior.
 *   2) Una semana después (+7 días, conserva el día de semana, sigue siendo
 *      hábil): seguimiento de los compromisos.
 *
 * Vive acá y no en el cron porque la página de la reunión también necesita
 * saber cuál de las dos es: el costo logístico del mes se muestra sólo en la
 * primera, que es donde se mira el cierre.
 */

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

/** Fechas objetivo del mes de `iso`: ["YYYY-MM-DD" primera, "YYYY-MM-DD" segunda]. */
export function presupuestoTargets(iso: string): [string, string] {
  const [y, m] = iso.split("-").map(Number)
  // El 16 del mes (índice de mes 0-based) en UTC para evitar corrimientos.
  const d16 = new Date(Date.UTC(y, m - 1, 16))
  const dow = d16.getUTCDay() // 0 = dom, 6 = sáb
  const offset = dow === 6 ? 2 : dow === 0 ? 1 : 0
  const primera = new Date(Date.UTC(y, m - 1, 16 + offset))
  const segunda = new Date(primera)
  segunda.setUTCDate(segunda.getUTCDate() + 7)
  return [fmt(primera), fmt(segunda)]
}

/**
 * ¿La reunión de `fechaISO` es la de seguimiento (+7 días)? Las creadas a mano
 * en otra fecha cuentan como "primera": se arman para mirar el cierre.
 */
export function esSeguimientoPresupuesto(fechaISO: string): boolean {
  return presupuestoTargets(fechaISO)[1] === fechaISO
}

/** Mes anterior al de la reunión: el cierre que se revisa. */
export function mesCierreDe(fechaISO: string): { anio: number; mes: number } {
  const anio = Number(fechaISO.slice(0, 4))
  const mes = Number(fechaISO.slice(5, 7))
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
}

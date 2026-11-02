/**
 * Hasta qué día muestra datos la grilla de una reunión.
 *
 * Regla base: la grilla arma el mes de la fecha de la reunión y muestra hasta
 * esa fecha. El día de la reunión se oculta mientras sea HOY o futuro (al
 * matinal el cierre todavía no está confirmado) y se revela cuando quedó atrás.
 *
 * Cola del mes (pedido del 2/11/26): la reunión del ÚLTIMO DÍA HÁBIL del mes
 * revela además los días que quedan del mes (sábado, domingo, feriado) a
 * medida que van cerrando. Antes el sábado 31/10 no se veía en ninguna
 * reunión: la del viernes 30 cortaba en el 30 y la del lunes 2/11 ya armaba
 * noviembre. Como la grilla de la reunión se fija por su fecha, ésta es la
 * única reunión que puede mostrar el mes completo para el análisis mensual.
 *
 * Módulo puro (sin fetch) para poder importarlo también desde el cliente.
 */

import { diaAnterior, esFeriado } from "@/lib/feriados-ar"

/** HOY en zona horaria de Argentina (YYYY-MM-DD). Usar SIEMPRE esto en vez de
 * `toISOString()`, que devuelve UTC y de noche (>21hs ART) adelanta un día. */
export function hoyArgentina(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

function ultimoDiaDelMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 0)) // día 0 del mes siguiente = último del mes
  return d.toISOString().slice(0, 10)
}

function diaSiguiente(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Día hábil = ni sábado, ni domingo, ni feriado (los días en que hay reunión). */
function esDiaHabil(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !esFeriado(iso)
}

/** ¿Después de `fechaReunion` no queda ningún día hábil en su mes? */
export function esUltimaReunionDelMes(fechaReunion: string): boolean {
  const ult = ultimoDiaDelMes(fechaReunion)
  for (let d = diaSiguiente(fechaReunion); d <= ult; d = diaSiguiente(d)) {
    if (esDiaHabil(d)) return false
  }
  return true
}

/**
 * Última fecha que la grilla de la reunión puede mostrar.
 *  - Reunión común: su propia fecha.
 *  - Reunión de cierre del mes (sin hábiles después): hasta el último día del
 *    mes, pero sólo lo que ya cerró (ayer, en Argentina).
 */
export function ultimaFechaVisible(fechaReunion: string, hoy: string): string {
  if (!esUltimaReunionDelMes(fechaReunion)) return fechaReunion
  const ult = ultimoDiaDelMes(fechaReunion)
  if (fechaReunion >= ult) return fechaReunion
  const ayer = diaAnterior(hoy)
  const tope = ayer < ult ? ayer : ult
  return tope > fechaReunion ? tope : fechaReunion
}

/** ¿El día `f` ya cerró (dato confirmado)? El día de la reunión se oculta
 * mientras la reunión sea de HOY o futura (en el matinal el cierre del día aún
 * no está confirmado). Una vez que esa fecha quedó en el pasado, el día de la
 * reunión ya cerró y se revela; si además es la reunión de cierre del mes, se
 * revela la cola del mes (ver `ultimaFechaVisible`). */
export function diaCerrado(f: string, fechaReunion: string, hoy: string): boolean {
  if (fechaReunion < hoy) return f <= ultimaFechaVisible(fechaReunion, hoy)
  return f < fechaReunion
}

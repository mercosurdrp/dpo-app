/**
 * Programación del CIL: los DOS días del mes que le toca a cada camión (DPO
 * Flota 4.1).
 *
 * 🚨 El día sale de un sorteo DETERMINISTA, no de una tirada guardada en la
 * base: `dominio + mes` entran a un hash y de ahí salen los dos días. La misma
 * unidad y el mismo mes dan siempre el mismo par, así que la pantalla del
 * supervisor, el cartel del chofer y el cron de avisos coinciden sin que haya
 * que persistir nada ni correr un proceso el 1° de cada mes. Si el 1° el cron no
 * corrió, el mes igual tiene sus días.
 *
 * 🚨 **Este archivo no se toca.** Cambiar el hash, el orden de los días hábiles
 * o el separador del seed MUEVE los días de todos los meses, incluidos los que
 * ya pasaron y los que ya se avisaron por la campanita. Si algún día hay que
 * cambiar la regla, se hace con una regla nueva a partir de un mes futuro, no
 * editando esta.
 *
 * 🚨 El sorteo es por unidad y NO reparte la carga entre las unidades: dos
 * camiones pueden caer el mismo día. Es a propósito — un reparto parejo tendría
 * que mirar la flota entera, y entonces dar de baja un camión a mitad de mes le
 * correría el día a todos los demás, justo después de habérselo avisado.
 */

import { esFeriado } from "@/lib/feriados-ar"

/** Sólo camiones: decisión de Francisco (28/09/2026). */
export const TIPOS_CIL_PROGRAMADOS = ["camion"] as const

/**
 * Cuántos días para adelante o para atrás se le perdona a una carga: se hizo,
 * pero no el día que tocaba.
 */
export const TOLERANCIA_DIAS = 2

/** Cuántas veces al mes le toca a cada unidad. */
export const VECES_POR_MES = 2

/**
 * Primer mes con días asignados.
 *
 * 🚨 Los meses anteriores devuelven vacío a propósito. El sorteo es determinista
 * y sabe calcular cualquier mes, así que sin este corte septiembre de 2026 abría
 * con 17 días vencidos de días que nadie podía conocer: la programación no
 * existía y los choferes no estaban avisados. Un tablero que acusa por algo que
 * no se comunicó se deja de mirar.
 */
export const PROGRAMACION_DESDE = "2026-10"

/**
 * Hash FNV-1a de 32 bits. Chico, estable y sin dependencias: lo único que se le
 * pide es repartir parejo y dar siempre lo mismo para la misma entrada.
 */
function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Cuántos días tiene el mes `YYYY-MM`. */
function diasDelMes(ym: string): number {
  const [a, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

/**
 * Los días hábiles del mes, de lunes a viernes y sin feriados.
 *
 * 🚨 Sábado afuera aunque la flota reparta los sábados: de las 61 tareas CIL
 * cargadas hasta el 28/09/2026 **ninguna** es de un sábado (33 son de lunes), y
 * un día sorteado en sábado se vencería solo. Domingo tampoco: la operación no
 * trabaja.
 *
 * 🚨 Los feriados también: el sorteo crudo le puso el 25/12 al AF588SU y el 1/1
 * al AF028YB. Un día asignado en Navidad no es un día asignado, es un vencido
 * programado.
 */
export function diasHabilesDelMes(ym: string): number[] {
  const [a, m] = ym.split("-").map(Number)
  const out: number[] = []
  for (let d = 1; d <= diasDelMes(ym); d++) {
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
    if (dow === 0 || dow === 6) continue
    if (esFeriado(`${ym}-${String(d).padStart(2, "0")}`)) continue
    out.push(d)
  }
  return out
}

/**
 * Los dos días que le tocan a una unidad en el mes, como fechas `YYYY-MM-DD`.
 *
 * 🚨 Uno cae en la primera quincena y el otro en la segunda. Con dos tiradas
 * libres sobre el mes entero, un par como el 6 y el 8 era perfectamente posible:
 * "dos veces al mes" se cumpliría en el papel y la unidad quedaría tres semanas
 * sin que nadie la toque, que es justo lo que el 4.1 quiere evitar.
 */
export function fechasCilDelMes(dominio: string, ym: string): string[] {
  if (ym < PROGRAMACION_DESDE) return []
  const habiles = diasHabilesDelMes(ym)
  if (habiles.length === 0) return []
  const primera = habiles.filter((d) => d <= 15)
  const segunda = habiles.filter((d) => d > 15)
  const h = hash32(`${dominio}|${ym}`)
  // Dos tiradas del mismo hash: los bits bajos para la primera quincena y los
  // altos para la segunda, así las dos elecciones no quedan atadas entre sí.
  const dias = [
    primera.length > 0 ? primera[h % primera.length] : null,
    segunda.length > 0 ? segunda[(h >>> 11) % segunda.length] : null,
  ].filter((d): d is number => d != null)
  return dias.map((d) => `${ym}-${String(d).padStart(2, "0")}`)
}

/** ¿Hoy le toca a esta unidad? */
export function esDiaCil(dominio: string, fecha: string): boolean {
  return fechasCilDelMes(dominio, fecha.slice(0, 7)).includes(fecha.slice(0, 10))
}

/**
 * La próxima fecha que le toca a la unidad desde `desde` (incluido), mirando
 * este mes y el que viene. `null` sólo si el mes siguiente no tiene días
 * hábiles, que no pasa.
 */
export function proximaFechaCil(dominio: string, desde: string): string | null {
  const ym = desde.slice(0, 7)
  const [a, m] = ym.split("-").map(Number)
  const siguiente = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`
  const candidatas = [...fechasCilDelMes(dominio, ym), ...fechasCilDelMes(dominio, siguiente)]
  return candidatas.find((f) => f >= desde.slice(0, 10)) ?? null
}

/** "martes 7/10" — cómo se nombra un día cuando hay que ir a hacerlo. */
export function fmtDiaConNombre(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number)
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return `${dias[dow]} ${d}/${m}`
}

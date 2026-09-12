/**
 * Numeración de fuego de las cubiertas.
 *
 * Cada cubierta de la flota lleva un número grabado a fuego en el flanco. Es
 * una serie única y correlativa de toda la flota (no por unidad): la cubierta
 * que se marca hoy lleva el número siguiente al último marcado, y ese número
 * la acompaña hasta la baja, aunque cambie de camión o de posición.
 *
 * El campo donde vive es `mantenimiento_neumaticos.numero`, el mismo que el
 * formulario de desecho manda como `numeros_fuego`.
 *
 * Formas que toma un número de la serie:
 *   "80"   → cubierta 80
 *   "080"  → la misma (los ceros a la izquierda no cuentan)
 *   "27R"  → la 27 después de recaparse; sigue siendo la 27, no un número nuevo
 *
 * Lo que NO es de la serie: los códigos de 4 o 5 dígitos que entraron con la
 * importación de Cloudfleet (1073, 1131, 13290…) son números de serie del
 * fabricante, y los "TMP_14…TMP_21" son marcadores de esa misma importación
 * para cubiertas que nadie llegó a identificar. Por eso la serie se corta en
 * SERIE_FUEGO_MAX: a 80 marcadas y ~25 por año, el 999 queda a décadas de acá.
 */

/** Tope de la serie de fuego. Arriba de esto es número de fabricante. */
export const SERIE_FUEGO_MAX = 999

export interface NumeroFuego {
  /** El número, sin ceros a la izquierda ni la R. */
  n: number
  /** La marcación lleva "R" de recapada. */
  recapada: boolean
}

/** Lee un número de fuego. Devuelve null si el texto no es de la serie. */
export function parseNumeroFuego(raw: string | null | undefined): NumeroFuego | null {
  const t = (raw ?? "").trim()
  if (!t) return null
  const m = /^0*(\d{1,4})\s*(R)?$/i.exec(t)
  if (!m) return null
  const n = Number(m[1])
  if (n < 1 || n > SERIE_FUEGO_MAX) return null
  return { n, recapada: Boolean(m[2]) }
}

/** Cómo se escribe un número de la serie. */
export function formatNumeroFuego(n: number, recapada = false): string {
  return `${n}${recapada ? "R" : ""}`
}

export interface CubiertaConNumero {
  id: string
  numero: string | null
}

export interface SerieFuego {
  /** Número de la serie → ids de las cubiertas que lo tienen. */
  ocupados: Map<number, string[]>
  /** El más alto marcado hasta ahora. */
  ultimo: number | null
  /** El que hay que marcar en la próxima cubierta. */
  proximo: number
  /**
   * Números de la serie que no figuran en el sistema. No están libres: son
   * cubiertas que existen y nunca se cargaron (el auxilio del OJA, las que
   * salieron de una unidad, las del acoplado). Por eso se pueden elegir al
   * dar de alta, pero sólo de esta lista.
   */
  huecos: number[]
}

/** Estado de la serie a partir de todas las cubiertas del sistema. */
export function analizarSerieFuego(cubiertas: CubiertaConNumero[]): SerieFuego {
  const ocupados = new Map<number, string[]>()
  for (const c of cubiertas) {
    const p = parseNumeroFuego(c.numero)
    if (!p) continue
    const ids = ocupados.get(p.n)
    if (ids) ids.push(c.id)
    else ocupados.set(p.n, [c.id])
  }
  const usados = [...ocupados.keys()].sort((a, b) => a - b)
  const ultimo = usados.length > 0 ? usados[usados.length - 1] : null
  const huecos: number[] = []
  for (let i = 1; i < (ultimo ?? 0); i++) if (!ocupados.has(i)) huecos.push(i)
  return { ocupados, ultimo, proximo: (ultimo ?? 0) + 1, huecos }
}

/** Los `cantidad` números que siguen, para una carga de varias cubiertas. */
export function siguientesFuego(serie: SerieFuego, cantidad: number): number[] {
  return Array.from({ length: Math.max(0, cantidad) }, (_, i) => serie.proximo + i)
}

/** Quién tiene ese número, para el mensaje de error. */
function ocupadoPorOtro(serie: SerieFuego, n: number, idPropio?: string): boolean {
  const ids = serie.ocupados.get(n)
  if (!ids) return false
  return ids.some((id) => id !== idPropio)
}

export type ValidacionFuego = { ok: true } | { ok: false; error: string }

/**
 * Un número sólo vale si es el que sigue en la serie o uno de los huecos —
 * nunca uno repetido ni uno salteado. Vacío también vale: una cubierta puede
 * entrar al stock sin marcar y marcarse después.
 */
export function validarNumeroFuego(
  raw: string | null | undefined,
  serie: SerieFuego,
  opts: { idPropio?: string; valorActual?: string | null } = {}
): ValidacionFuego {
  const t = (raw ?? "").trim()
  const actual = (opts.valorActual ?? "").trim()
  // Sin cambios: nunca se rechaza lo que ya estaba guardado, así una cubierta
  // vieja con número de fabricante se puede seguir editando.
  if (t === actual) return { ok: true }
  if (!t) return { ok: true }

  const p = parseNumeroFuego(t)
  if (!p) {
    return {
      ok: false,
      error: `"${t}" no es un número de la serie de fuego. El que sigue es el ${serie.proximo}.`,
    }
  }
  if (ocupadoPorOtro(serie, p.n, opts.idPropio)) {
    return {
      ok: false,
      error: `El ${p.n} ya está marcado en otra cubierta. El que sigue es el ${serie.proximo}.`,
    }
  }
  if (p.n === serie.proximo) return { ok: true }
  if (serie.huecos.includes(p.n)) return { ok: true }
  return {
    ok: false,
    error:
      `La serie va por el ${serie.ultimo ?? 0}: el número que sigue es el ${serie.proximo}. ` +
      (serie.huecos.length > 0
        ? `Si la cubierta ya viene marcada, los únicos anteriores sin cargar son: ${serie.huecos.join(", ")}.`
        : `No hay números anteriores sin cargar.`),
  }
}

/**
 * Valida una carga de varias cubiertas de una. Se toma número por número: si
 * el lote es 80, 81, 82, el 81 recién es válido una vez tomado el 80.
 */
export function validarLoteFuego(numeros: string[], serie: SerieFuego): ValidacionFuego {
  const ocupados = new Map(serie.ocupados)
  let proximo = serie.proximo
  const huecos = [...serie.huecos]
  for (const raw of numeros) {
    const parcial: SerieFuego = { ocupados, ultimo: proximo - 1, proximo, huecos }
    const v = validarNumeroFuego(raw, parcial)
    if (!v.ok) return v
    const p = parseNumeroFuego(raw)
    if (!p) continue
    ocupados.set(p.n, [...(ocupados.get(p.n) ?? []), "nuevo"])
    const iHueco = huecos.indexOf(p.n)
    if (iHueco >= 0) huecos.splice(iHueco, 1)
    else proximo = p.n + 1
  }
  return { ok: true }
}

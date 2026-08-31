/**
 * Limpieza de cargas de gasoil para calcular km/l.
 *
 * 🚨 Una carga que NO se registró en la app no desaparece: el odómetro de la
 * carga siguiente arrastra los km de las dos y el rendimiento del tramo sale
 * imposible (8, 10, 20 km/l en un camión de 17 t que hace 3,5). Sumado tal
 * cual, ese tramo INFLA el km/l de la flota: en agosto de 2026 el número crudo
 * daba 3,80 y el limpio 3,64. El techo fijo de 6 km/l (`REND_MAX`) no alcanza:
 * un tramo de 5,3 en un camión que rinde 3,5 también es una carga faltante.
 *
 * Criterio (el mismo del informe de combustible del 31/08/2026): un tramo con
 * rendimiento mayor a `FACTOR_CARGA_FALTANTE` × la mediana del propio camión
 * es una carga sin registrar y se excluye del km/l (sus litros existen, pero
 * no se sabe cuántos km cubrieron). La mediana se toma sobre el historial que
 * se le pase (idealmente ≥ 60-90 días), no sólo sobre el mes.
 *
 * Los tramos con rendimiento bajísimo (odómetro mal tipeado, top-up) NO se
 * excluyen: sus litros son reales y al sumar Σkm/Σlitros se compensan con el
 * tramo siguiente.
 */

export const FACTOR_CARGA_FALTANTE = 1.4

/** Rango dentro del cual un tramo cuenta para la mediana del camión. */
export const REND_PLAUSIBLE_MIN = 2
export const REND_PLAUSIBLE_MAX = 6

/** Mínimo de tramos plausibles para confiar en la mediana de un camión. */
const MIN_TRAMOS_MEDIANA = 3

export interface CargaConKm {
  dominio: string
  litros: number | null
  km_recorridos: number | null
}

function rendimientoDe(c: CargaConKm): number | null {
  const km = Number(c.km_recorridos ?? 0)
  const litros = Number(c.litros ?? 0)
  return km > 0 && litros > 0 ? km / litros : null
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const s = [...valores].sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

/**
 * Mediana de rendimiento por dominio sobre los tramos plausibles del historial.
 * Devuelve sólo los dominios con muestra suficiente.
 */
export function medianasPorDominio(historial: CargaConKm[]): Map<string, number> {
  const porDominio = new Map<string, number[]>()
  for (const c of historial) {
    const r = rendimientoDe(c)
    if (r == null || r < REND_PLAUSIBLE_MIN || r > REND_PLAUSIBLE_MAX) continue
    const arr = porDominio.get(c.dominio) ?? []
    arr.push(r)
    porDominio.set(c.dominio, arr)
  }
  const out = new Map<string, number>()
  for (const [dominio, arr] of porDominio) {
    if (arr.length < MIN_TRAMOS_MEDIANA) continue
    const m = mediana(arr)
    if (m != null) out.set(dominio, m)
  }
  return out
}

/**
 * ¿Este tramo es una carga sin registrar? Con mediana del camión: rendimiento
 * > 1,4× la mediana. Sin mediana (camión nuevo o con pocas cargas): techo fijo
 * `REND_PLAUSIBLE_MAX`.
 */
export function esCargaSinRegistrar(
  c: CargaConKm,
  medianas: Map<string, number>,
): boolean {
  const r = rendimientoDe(c)
  if (r == null) return false
  const m = medianas.get(c.dominio)
  return m != null ? r > FACTOR_CARGA_FALTANTE * m : r > REND_PLAUSIBLE_MAX
}

/**
 * Separa las cargas del período en válidas (entran al km/l) y sospechosas
 * (carga faltante en el medio: se excluyen del km/l). `historial` es la muestra
 * para la mediana de cada camión; puede incluir a las mismas `cargas`.
 */
export function separarCargasSinRegistrar<T extends CargaConKm>(
  cargas: T[],
  historial: CargaConKm[],
): { validas: T[]; sinRegistrar: T[] } {
  const medianas = medianasPorDominio(historial)
  const validas: T[] = []
  const sinRegistrar: T[] = []
  for (const c of cargas) {
    if (esCargaSinRegistrar(c, medianas)) sinRegistrar.push(c)
    else validas.push(c)
  }
  return { validas, sinRegistrar }
}

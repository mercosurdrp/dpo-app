// Metas del TLP (CEq por hora-hombre).
//
// Metodología:
//   meta    = mejor mes ya logrado por esa ciudad (repetir lo que ya se pudo)
//   gatillo = 85% de esa meta (`gatilloDe`), regla pareja para todas: debajo de
//             eso, rojo. Se prefirió al "promedio propio" porque no depende de la
//             historia de cada ciudad y se explica en una línea.
//
// Recalibradas 2026-07-14 sobre abr–jul, después de dos correcciones que movieron
// el piso: ya no se descarta el viaje sin checklist (antes se iba con su carga
// incluida — en junio, el 7% de las CEq del mes) y la dotación faltante se estima
// con el FTE promedio de la patente en vez de un 2 fijo que la subestimaba.
//
// El TLP varía estructuralmente por ciudad según las horas en ruta (distancia del
// CD): Ramallo rinde ~2× Pergamino con la misma dotación. Por eso cada ciudad mide
// contra SU meta y el global contra la meta Mercosur.
// Igual semántica que el semáforo del Sueño: ≥meta verde · ≥gatillo amarillo.
//
// Desempeño abr–jul 2026 sobre el que se calibró (mejor mes · promedio del año):
//   Ramallo      51,2 · 43,8   ← 15% del volumen
//   Arrecifes    41,2 · 33,1   ← 5%, y viene cayendo fuerte (26,0 jun · 21,1 jul)
//   San Nicolás  34,3 · 31,8   ← 48% del volumen: es el que arrastra el global
//   Colón        27,4 · 24,6
//   Pergamino    27,7 · 22,7   ← 24% del volumen

export interface TlpMeta {
  meta: number
  gatillo: number
}

/** Gatillo = 85% de la meta, redondeado. Debajo de eso, rojo. */
const GATILLO_PCT = 0.85
const gatilloDe = (meta: number): number => Math.round(meta * GATILLO_PCT)
const conGatillo = (meta: number): TlpMeta => ({ meta, gatillo: gatilloDe(meta) })

/**
 * Meta global Mercosur (nodo TLP del Árbol del Sueño). El año cerró en 31,8 y el
 * mejor mes fue 35,2 (marzo).
 */
export const TLP_META_GLOBAL: TlpMeta = conGatillo(34)

export const TLP_METAS_CIUDAD: Record<string, TlpMeta> = {
  "San Nicolás": conGatillo(34),
  Pergamino: conGatillo(27),
  Ramallo: conGatillo(51),
  Colón: conGatillo(27),
  Arrecifes: conGatillo(41),
}

/** Meta de una ciudad; ciudades sin meta propia miden contra la global. */
export function tlpMetaDe(ciudad: string): TlpMeta {
  return TLP_METAS_CIUDAD[ciudad] ?? TLP_META_GLOBAL
}

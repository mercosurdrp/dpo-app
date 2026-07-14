// Metas del TLP (CEq por hora-hombre).
//
// Metodología:
//   meta    = mejor mes ya logrado por esa ciudad (repetir lo que ya se pudo)
//   gatillo = su propio promedio del año, redondeado hacia abajo (si empeora
//             respecto de sí misma, rojo). Ojo: el gatillo NO puede ser igual al
//             promedio, o la ciudad que está justo EN su promedio da rojo.
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

/**
 * Meta global Mercosur (nodo TLP del Árbol del Sueño). El año cerró en 31,8 y el
 * mejor mes fue 35,2 (marzo).
 */
export const TLP_META_GLOBAL: TlpMeta = { meta: 34, gatillo: 30 }

export const TLP_METAS_CIUDAD: Record<string, TlpMeta> = {
  "San Nicolás": { meta: 34, gatillo: 31 },
  Pergamino: { meta: 27, gatillo: 22 },
  Ramallo: { meta: 51, gatillo: 43 },
  Colón: { meta: 27, gatillo: 24 },
  Arrecifes: { meta: 41, gatillo: 33 },
}

/** Meta de una ciudad; ciudades sin meta propia miden contra la global. */
export function tlpMetaDe(ciudad: string): TlpMeta {
  return TLP_METAS_CIUDAD[ciudad] ?? TLP_META_GLOBAL
}

// Metas del TLP (CEq por hora-hombre) — definidas jul-2026 sobre el histórico
// abr–jun 2026 (primeros meses con checklist de retorno completo):
//
//   meta    = mejor mes completo ya logrado por esa ciudad (sostener lo probado)
//   gatillo = peor mes del período (piso demostrado; debajo de eso, rojo)
//
// El TLP varía estructuralmente por ciudad según las horas en ruta (distancia
// del CD): Ramallo rinde ~2× Arrecifes con la misma dotación. Por eso cada
// ciudad mide contra SU meta y el global contra la meta Mercosur.
// Igual semántica que el semáforo del Sueño: ≥meta verde · ≥gatillo amarillo.

export interface TlpMeta {
  meta: number
  gatillo: number
}

/** Meta global Mercosur (nodo TLP del Árbol del Sueño). */
export const TLP_META_GLOBAL: TlpMeta = { meta: 25, gatillo: 20 }

export const TLP_METAS_CIUDAD: Record<string, TlpMeta> = {
  "San Nicolás": { meta: 26, gatillo: 20 },
  Pergamino: { meta: 22, gatillo: 17 },
  Ramallo: { meta: 40, gatillo: 28 },
  Colón: { meta: 22, gatillo: 16 },
  Arrecifes: { meta: 18, gatillo: 14 },
}

/** Meta de una ciudad; ciudades sin meta propia miden contra la global. */
export function tlpMetaDe(ciudad: string): TlpMeta {
  return TLP_METAS_CIUDAD[ciudad] ?? TLP_META_GLOBAL
}

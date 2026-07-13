// Metas del TLP (CEq por hora-hombre).
//
// Metodología:
//   meta    = mejor mes completo ya logrado por esa ciudad (sostener lo probado)
//   gatillo = peor mes del período (piso demostrado; debajo de eso, rojo)
//
// Recalibradas 2026-07-13 sobre abr–jun (los meses con checklist de retorno
// completo) DESPUÉS de corregir el numerador: el TLP contaba sólo las CEq de
// Chess y se comía las de Gestión/GESCOM (~30% del volumen), así que las metas
// anteriores (global 25/20) quedaron chicas — Arrecifes venía midiendo 33,5
// contra una meta de 18. Ver `lib/tlp/ceq-gescom.ts`.
//
// El TLP varía estructuralmente por ciudad según las horas en ruta (distancia
// del CD): Ramallo rinde ~2× Pergamino con la misma dotación. Por eso cada
// ciudad mide contra SU meta y el global contra la meta Mercosur.
// Igual semántica que el semáforo del Sueño: ≥meta verde · ≥gatillo amarillo.

export interface TlpMeta {
  meta: number
  gatillo: number
}

/** Meta global Mercosur (nodo TLP del Árbol del Sueño). */
export const TLP_META_GLOBAL: TlpMeta = { meta: 32, gatillo: 27 }

export const TLP_METAS_CIUDAD: Record<string, TlpMeta> = {
  "San Nicolás": { meta: 36, gatillo: 29 },
  Pergamino: { meta: 24, gatillo: 22 },
  Ramallo: { meta: 52, gatillo: 33 },
  Colón: { meta: 25, gatillo: 22 },
  Arrecifes: { meta: 40, gatillo: 26 },
}

/** Meta de una ciudad; ciudades sin meta propia miden contra la global. */
export function tlpMetaDe(ciudad: string): TlpMeta {
  return TLP_METAS_CIUDAD[ciudad] ?? TLP_META_GLOBAL
}

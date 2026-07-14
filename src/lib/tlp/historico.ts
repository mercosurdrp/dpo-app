// Meses del TLP que NO se pueden calcular viaje a viaje: enero, febrero y marzo
// de 2026. El checklist de retorno —única fuente del tiempo en ruta por viaje—
// arrancó el 9 de abril.
//
// Se cierran con el MISMO criterio que usa el cuadro de Indicadores de abril en
// adelante, así el año es comparable de punta a punta:
//
//   TLP = CEq del mes ÷ (viajes × FTE promedio × horas promedio)
//
//   - CEq:    RPC `cuadro_ceq_mensual` (Chess + Gestión)
//   - viajes: CAMIÓN-DÍA con carga + segundas vueltas (fila "Camiones a la calle")
//   - FTE:    chofer + ayudantes promediado sobre los egresos del mes
//   - horas:  promedio de las RUTAS LIMPIAS de Foxtrot (las cerradas en el día);
//             tomando todas daría 11,8 hs por ruta en enero, un número falso.
//
// 🚨 El cierre anterior (38,12 · 39,54 · 44,01) contaba los viajes con las RUTAS de
// Foxtrot: 199 en enero contra los 234 camión-día reales. Menos viajes ⇒ menos
// horas-hombre ⇒ TLP inflado. Corregido el 14-jul-2026: enero 33,73 · febrero
// 32,87 · marzo 35,18, y desaparece el escalón contra abril–julio (27 a 31), que
// no era una caída de productividad sino una diferencia de medición.
//
// 🚨 NO tienen desglose por ciudad: en esos meses Foxtrot no resuelve la patente
// (43 a 55 rutas ni siquiera identifican al chofer), así que suman en el TOTAL
// —evolución, YTD y raíz del árbol— pero no en las ramas por ciudad.
//
// A partir de abril NO se usa esto: el TLP se calcula viaje a viaje.

export interface TlpHistoricoMes {
  ceq: number
  /** Horas-hombre del mes: viajes × FTE × horas promedio. */
  hh: number
  /** Horas en ruta del mes (sin FTE): viajes × horas promedio. */
  horasRuta: number
  /** Camión-día con carga + segundas vueltas. */
  viajes: number
}

// enero:   150.418 CEq ÷ (234 viajes × 2,58 FTE × 7,38 hs) = 33,73
// febrero: 129.094 CEq ÷ (201 viajes × 2,72 FTE × 7,18 hs) = 32,87
// marzo:   127.453 CEq ÷ (229 viajes × 2,42 FTE × 6,53 hs) = 35,18
export const TLP_HISTORICO: Record<string, TlpHistoricoMes> = {
  "2026-01": { ceq: 150418, hh: 4459, horasRuta: 1727, viajes: 234 },
  "2026-02": { ceq: 129094, hh: 3927, horasRuta: 1443, viajes: 201 },
  "2026-03": { ceq: 127453, hh: 3623, horasRuta: 1495, viajes: 229 },
}

export interface TlpHistoricoRango extends TlpHistoricoMes {
  /** Meses (1..12) que aportaron, para la evolución mensual. */
  meses: Map<number, TlpHistoricoMes>
}

const finDeMes = (mes: string): string => {
  const [a, m] = mes.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${mes}-${String(ultimo).padStart(2, "0")}`
}

/**
 * Meses históricos ENTEROS contenidos en el rango. Un mes histórico solo cuenta
 * si el rango lo cubre completo: si no, mezclaría un cierre mensual con un
 * período parcial y el TLP no querría decir nada.
 */
export function historicoEnRango(desde: string, hasta: string): TlpHistoricoRango {
  const out: TlpHistoricoRango = { ceq: 0, hh: 0, horasRuta: 0, viajes: 0, meses: new Map() }
  for (const [mes, h] of Object.entries(TLP_HISTORICO)) {
    if (`${mes}-01` < desde || finDeMes(mes) > hasta) continue
    out.ceq += h.ceq
    out.hh += h.hh
    out.horasRuta += h.horasRuta
    out.viajes += h.viajes
    out.meses.set(Number(mes.slice(5, 7)), h)
  }
  return out
}

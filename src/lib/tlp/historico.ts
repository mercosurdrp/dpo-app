// Meses del TLP que NO se pueden calcular viaje a viaje: enero, febrero y marzo
// de 2026.
//
// El checklist de retorno —única fuente del tiempo en ruta— arrancó el 9 de abril,
// y en esos tres meses tampoco hay egresos cargados (sin egreso no hay dotación,
// o sea no hay FTE). Con lo único que hay, Foxtrot, el tiempo en ruta sale muy
// largo (708 min promedio en enero, casi 12 h) y no reproduce el cierre: Foxtrot
// × FTE 2 daría 4.696 horas-hombre en enero contra las 3.945 del cierre.
//
// Así que estos meses entran con el DATO DE CIERRE de Andy:
//   - horas-hombre: las que cerró él (de Foxtrot, con su propio criterio de FTE);
//   - CEq: las distribuidas del mes (Chess + Gestión), tal cual las publica el
//     cuadro de Indicadores (RPC `cuadro_ceq_mensual`) — coinciden al 100% con
//     las que implican sus TLP;
//   - horas de ruta y viajes: los de Foxtrot, para poder mostrar el FTE implícito.
//
// 🚨 NO tienen desglose por ciudad: Foxtrot no trae patente en esos meses (43 a 55
// rutas ni siquiera resuelven el chofer), así que estos meses suman en el TOTAL —
// evolución, YTD y raíz del árbol— pero no en las ramas por ciudad.
//
// A partir de abril NO se usa esto: el TLP se calcula viaje a viaje.

export interface TlpHistoricoMes {
  ceq: number
  /** Horas-hombre del mes (horas en ruta × FTE), cerradas sobre Foxtrot. */
  hh: number
  /** Horas en ruta de Foxtrot (sin FTE) — solo para mostrar el FTE implícito. */
  horasRuta: number
  /** Rutas de Foxtrot del mes. */
  viajes: number
}

export const TLP_HISTORICO: Record<string, TlpHistoricoMes> = {
  "2026-01": { ceq: 150365, hh: 3945, horasRuta: 2348, viajes: 199 },
  "2026-02": { ceq: 129094, hh: 3265, horasRuta: 1728, viajes: 157 },
  "2026-03": { ceq: 127453, hh: 2896, horasRuta: 1693, viajes: 175 },
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

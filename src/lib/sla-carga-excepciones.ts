/**
 * Correcciones manuales del SLA de carga (`alm_carga`), en un archivo aparte
 * porque las leen DOS consumidores: la matriz de /sla (src/actions/sla.ts, que
 * es "use server" y no puede exportar constantes) y el motor de alertas de
 * almacén. Si vivieran en uno solo, el tablero de pendientes podría decir un
 * número y la pestaña de SLA otro para el mismo mes.
 */

/**
 * Viajes que el pusher marca "tarde" por la heurística de las 11:00 pero que en
 * realidad se cargaron temprano para salir al día SIGUIENTE. Se fuerzan a "a
 * tiempo" y se recalcula el estado del día.
 *   • 2026-06-22: día atípico, las cargas arrancaron antes de lo habitual; el
 *     viaje 1525 se cargó 10:27 para el reparto del día siguiente.
 *
 * PREFERIR el override del pusher (`$overridesReparto` en push_sla_carga.ps1)
 * cuando se puede probar a qué reparto pertenece el viaje: aquél lo REASIGNA al
 * día correcto, con lo que el día destino también deja de contarlo como
 * faltante. Esta tabla solo fuerza "a tiempo" en el día de origen, así que el
 * destino sigue mostrando "faltan 1".
 */
export const CARGA_EXCEPCIONES_A_TIEMPO: Record<string, Set<number>> = {
  "2026-06-22": new Set([1525]),
}

/**
 * Días que se dan por CUMPLIDOS por revisión manual, pese a la marca "no" del
 * pusher, cuando ese "no" proviene de un artefacto operativo y no de un
 * incumplimiento real. Los viajes "tarde" del día se normalizan a "a tiempo"
 * para que el detalle quede coherente; la nota explica el motivo.
 *   • 2026-07-01: los viajes marcados tarde (carga ~07:25–07:31, a segundos unos
 *     de otros) fueron despachos ficticios (regularización) que salieron al día
 *     siguiente; el reparto real del día cumplió.
 *
 * Las entradas provisorias del 2026-08-07 y 2026-08-12 se borraron el
 * 22-08-2026: el pusher ya distingue solo los camiones que tenían que salir esa
 * mañana (mira el lote del viaje en ViajesFhProgSalida y descarta los que no
 * tienen despacho), así que esos dos días dan verde por su cuenta.
 */
export const CARGA_EXCEPCIONES_DIA_CUMPLE: Record<string, string> = {
  "2026-07-01":
    "Cumplido por revisión manual: los viajes tarde fueron despachos ficticios (regularización) que salieron al día siguiente.",
}

/**
 * Feriados sin reparto: el depósito no carga, así que el día no aplica (ni verde
 * ni rojo), igual que un domingo. Manda sobre lo que traiga el pusher: si el blob
 * publicara viajes en un feriado serían regularizaciones, no cargas del día.
 */
export const CARGA_FERIADOS: Record<string, string> = {
  "2026-07-09": "Feriado (Día de la Independencia): no hubo reparto.",
}

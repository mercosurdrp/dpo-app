/**
 * Criterio ÚNICO de "cliente crítico" del Radar de Rechazos.
 *
 * Lo usan los tres consumidores — el feed público (`/api/radar-rechazos/feed`),
 * la pantalla (`getRadarCriticos`) y el PDF de Ventas — para que los tres digan
 * exactamente lo mismo. Antes cada uno tenía su propia definición.
 *
 * CRITERIO (pedido de Francisco), sumando SIN DINERO + CERRADO. Entra el cliente
 * que cumple CUALQUIERA de las dos condiciones:
 *   a) 2 o más rechazos en los últimos 30 días        → rechazos_30d >= 2
 *   b) más de 1 rechazo por mes en promedio en 12 meses → rechazos_anio > 12
 *
 * 🚨 Las dos ventanas salen TAL CUAL del snapshot (`_mes` = últimos 30 días,
 * `_anio` = últimos 365), que el cron ya calcula en VECES (cliente × fecha). NO
 * recalcular sobre la tabla `rechazos`: tiene UNA FILA POR ARTÍCULO, así que
 * contar filas infla el número por la cantidad de SKU del pedido. Además, leer
 * del snapshot mantiene el criterio coherente con la foto: una foto vieja
 * muestra los que eran críticos ESE día, no los que lo serían hoy.
 *
 * 🚨 La condición (b) casi nunca se activa sola: al 2026-07-31 sólo 5 clientes
 * de toda la cartera superan los 12 rechazos anuales, y los 5 ya entran por (a).
 */

/** Rechazos mínimos en los últimos 30 días — INCLUSIVE: 2 ya es crítico. */
export const UMBRAL_30D = 2
/** Meses de la ventana anual del snapshot (365 días). */
export const MESES_ANIO = 12
/** Promedio mensual mínimo en el año (EXCLUYENTE: más de 1 por mes). */
export const PROMEDIO_MENSUAL_ANIO = 1
/** Rechazos anuales a superar: 12 × 1. */
export const UMBRAL_ANIO = MESES_ANIO * PROMEDIO_MENSUAL_ANIO

/** Los cuatro conteos que guarda `radar_rechazos_cliente`. */
export interface ConteosRechazo {
  cerrado_mes?: number | null
  sin_dinero_mes?: number | null
  cerrado_anio?: number | null
  sin_dinero_anio?: number | null
}

export interface Criticidad {
  /** Veces en los últimos 30 días, sumando cerrado + sin dinero. */
  rechazos_30d: number
  /** Veces en los últimos 365 días, sumando cerrado + sin dinero. */
  rechazos_anio: number
  /** Cumple (a): 2 o más en 30 días. */
  por_ultimos_30d: boolean
  /** Cumple (b): más de 1 por mes en el año. */
  por_promedio_anio: boolean
  /** Cumple alguna de las dos ⇒ es crítico. */
  es_critico: boolean
}

/**
 * Evalúa el criterio sobre los conteos de un cliente del snapshot.
 *
 * 🚨 Los dos motivos se cuentan por separado en el snapshot: un mismo día con
 * rechazo por cerrado Y por sin dinero suma 2 acá. Es marginal y juega a favor
 * de detectarlo.
 */
export function evaluarCriticidad(c: ConteosRechazo): Criticidad {
  const rechazos_30d = Number(c.sin_dinero_mes ?? 0) + Number(c.cerrado_mes ?? 0)
  const rechazos_anio = Number(c.sin_dinero_anio ?? 0) + Number(c.cerrado_anio ?? 0)
  const por_ultimos_30d = rechazos_30d >= UMBRAL_30D
  const por_promedio_anio = rechazos_anio > UMBRAL_ANIO
  return {
    rechazos_30d,
    rechazos_anio,
    por_ultimos_30d,
    por_promedio_anio,
    es_critico: por_ultimos_30d || por_promedio_anio,
  }
}

/**
 * El criterio en una frase, para mostrarlo en la UI y en el feed.
 *
 * 🚨 UN SOLO template literal, sin partirlo en varios unidos con `+`. Con todos
 * los placeholders constantes, el minificador de Next 16 pliega la concatenación
 * y SE COME LA COLA de cada literal menos el último: esta misma frase salía en
 * producción como "2o más de 1(más de 12 en el año). Suma cerrado + sin dinero."
 * No lo ven ni `tsc` ni el dev server — sólo el bundle de producción.
 */
export function textoCriterio(): string {
  return `${UMBRAL_30D} o más rechazos en los últimos 30 días, o más de ${PROMEDIO_MENSUAL_ANIO} por mes en promedio en los últimos 12 meses (más de ${UMBRAL_ANIO} en el año). Suma cerrado + sin dinero.`
}

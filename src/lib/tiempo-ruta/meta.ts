/**
 * Tiempo en ruta (puerta a puerta, checklist de retorno) — DPO Entrega 1.2.
 * Meta oficial: 7 h (SOP 1.2 Rev H2). Antes la pantalla usaba 8 h y el SOP 7 h,
 * y el auditor veía dos metas distintas para el mismo indicador.
 *
 * Ojo: NO es el "Tiempo en ruta" de Foxtrot de la Matinal de Distribución. Ese
 * mide el camión en la calle con "más es mejor" (meta/gatillo en la config de
 * la reunión) y es otra lectura del tiempo.
 */
export const TIEMPO_RUTA_META_MINUTOS = 420
/** Hasta acá es "amarillo" en la pantalla; por encima, rojo. */
export const TIEMPO_RUTA_TOLERANCIA_MINUTOS = 60
/** % mínimo de retornos dentro de meta (mismo criterio que TML/TI). */
export const TIEMPO_RUTA_PCT_MINIMO = 65

/** Un mes queda "fuera de meta" (y pide plan) si el promedio supera la meta. */
export function tiempoRutaMesFueraDeMeta(promedioMinutos: number): boolean {
  return promedioMinutos > TIEMPO_RUTA_META_MINUTOS
}

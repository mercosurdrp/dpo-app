/**
 * Tiempo en ruta (puerta a puerta, checklist de retorno) — DPO Entrega 1.2.
 * Meta oficial: 7 h (SOP 1.2 Rev H2). Antes la pantalla usaba 8 h y el SOP 7 h,
 * y el auditor veía dos metas distintas para el mismo indicador.
 *
 * Ojo: NO es "Horas en la calle (Foxtrot)" de la Matinal de Distribución. Ese
 * mide el camión en la calle con "más es mejor" (meta/gatillo en la config de
 * la reunión) y es otra lectura del tiempo.
 */
export const TIEMPO_RUTA_META_MINUTOS = 420
/** Hasta acá es "amarillo" en la pantalla; por encima, rojo. */
export const TIEMPO_RUTA_TOLERANCIA_MINUTOS = 60
/**
 * Criterio ÚNICO (definido por Fausto el 09/11): un mes está en meta si el
 * PROMEDIO del tiempo en ruta es ≤ 7 h. El % de retornos ≤ 7 h se muestra como
 * dato informativo, sin umbral propio (con 65 % ningún mes de 2026 llegaba).
 */
export function tiempoRutaMesFueraDeMeta(promedioMinutos: number): boolean {
  return promedioMinutos > TIEMPO_RUTA_META_MINUTOS
}

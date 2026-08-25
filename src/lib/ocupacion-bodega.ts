/**
 * Ocupación de Bodega: capacidad del camión y mínimo de carga.
 *
 * Única fuente de verdad de los dos números. Antes cada pantalla tenía el suyo
 * (525 en las actions y el SLA, 600 en la matinal y en el diálogo del día), así
 * que el mismo viaje mostraba porcentajes distintos según dónde se lo mirara.
 *
 * - `CAPACIDAD_CEQ`: lo que entra físicamente en la bodega. Es el 100%: un
 *   camión al 100% está lleno, no "cumplió el objetivo".
 * - `MINIMO_CEQ`: carga mínima esperada por viaje. Es el objetivo comercial
 *   (SLA y meta del tablero), no un tope físico.
 *
 * El porcentaje se calcula acá y no en la base: la columna generada
 * `ob_pct_target` de `ocupacion_bodega_diaria` sigue dividiendo por su valor
 * histórico y NO debe usarse para mostrar ocupación.
 */

/** Capacidad de bodega de un camión, en cajas equivalentes. El 100%. */
export const CAPACIDAD_CEQ = 1440

/** Carga mínima esperada por viaje, en cajas equivalentes. */
export const MINIMO_CEQ = 600

/** El mínimo expresado como % de la capacidad (41,7%). */
export const MINIMO_PCT = (MINIMO_CEQ / CAPACIDAD_CEQ) * 100

/** % de ocupación de un viaje: cuánto del camión se llenó. */
export function obPct(ceq: number | null | undefined): number {
  const v = Number(ceq ?? 0)
  if (!Number.isFinite(v) || v <= 0) return 0
  return (v / CAPACIDAD_CEQ) * 100
}

/** ¿El viaje alcanza la carga mínima esperada? */
export function alcanzaMinimo(ceq: number | null | undefined): boolean {
  return Number(ceq ?? 0) >= MINIMO_CEQ
}

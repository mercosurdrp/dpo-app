/**
 * Ocupación de Bodega: capacidad del camión y mínimo de carga.
 *
 * Única fuente de verdad de los dos números. Antes cada pantalla tenía el suyo
 * (525 en las actions y el SLA, 600 en la matinal y en el diálogo del día), así
 * que el mismo viaje mostraba porcentajes distintos según dónde se lo mirara.
 *
 * - `CAPACIDAD_CEQ`: lo que entra físicamente en la bodega. Es el 100%: un
 *   camión al 100% está lleno, no "cumplió el objetivo".
 * - `OBJETIVO_CEQ`: la carga que se busca por viaje. Es el objetivo de gestión
 *   (y el mínimo pactado en el SLA), no un tope físico.
 *
 * De ahí salen DOS porcentajes distintos, y confundirlos fue el problema
 * original:
 * - `cumplimientoPct` (sobre el objetivo): el 100% significa "llegamos". Es el
 *   número de gestión y va en los tableros, con semáforo.
 * - `obPct` (sobre la capacidad): cuánto del camión se llenó de verdad. Es el
 *   dato físico y vive en el detalle, donde hay lugar para explicarlo.
 *
 * El porcentaje se calcula acá y no en la base: la columna generada
 * `ob_pct_target` de `ocupacion_bodega_diaria` sigue dividiendo por su valor
 * histórico y NO debe usarse para mostrar ocupación.
 */

/** Capacidad de bodega de un camión, en cajas equivalentes. El 100%. */
export const CAPACIDAD_CEQ = 1440

/** Carga objetivo por viaje, en cajas equivalentes. El 100% de los tableros. */
export const OBJETIVO_CEQ = 600

/** El objetivo expresado como % de la capacidad física (41,7%). */
export const OBJETIVO_PCT = (OBJETIVO_CEQ / CAPACIDAD_CEQ) * 100

function limpio(ceq: number | null | undefined): number {
  const v = Number(ceq ?? 0)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * % de cumplimiento del objetivo: 100% = se cargaron los 600 CEq. Es el número
 * que va en los tableros, porque su 100% quiere decir algo.
 */
export function cumplimientoPct(ceq: number | null | undefined): number {
  return (limpio(ceq) / OBJETIVO_CEQ) * 100
}

/**
 * % de ocupación física: cuánto del camión se llenó (100% = bodega llena).
 * Va en el detalle: en un tablero se lee como "vamos mal" cuando en realidad
 * ningún viaje llena el camión.
 */
export function obPct(ceq: number | null | undefined): number {
  return (limpio(ceq) / CAPACIDAD_CEQ) * 100
}

/** ¿El viaje alcanza la carga objetivo? */
export function alcanzaObjetivo(ceq: number | null | undefined): boolean {
  return Number(ceq ?? 0) >= OBJETIVO_CEQ
}

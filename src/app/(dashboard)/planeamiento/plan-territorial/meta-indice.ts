import type { PlanTerritorial, Territorio } from "@/actions/plan-territorial"

/**
 * Cumplimiento de un plan territorial: MEJORA DE DISTRIBUCIÓN CONTRA LA RED
 * (decidido con Sebastián el 13/11/2026).
 *
 * - Sólo distribución: el plan cambia rutas, no el almacén. El almacén se
 *   reparte por bulto a la misma tarifa en todas las ciudades, así que no las
 *   distingue y sólo diluye la señal (en Ramallo es casi la mitad del costo).
 * - Contra la red: paritaria, gasoil, inflación o temporada encarecen a todas
 *   las ciudades a la vez; comparando con la red del mismo período eso se
 *   cancela y queda lo que hizo el plan.
 *
 * Términos:
 * - $/HL de distribución de una ciudad = su costo de distribución ÷ sus HL.
 * - Red = las ciudades juntas (sólo lo entregado a PDV): su costo de
 *   distribución ÷ sus HL.
 * - Índice = $/HL de distribución de la ciudad ÷ el de la red.
 * - Base = el índice de los meses de la línea base. Queda CONGELADO en el plan
 *   (`base_dist_x_hl`, `base_red_dist_x_hl`); si no está, se calcula en vivo.
 * - Mejora = índice del período ÷ índice base − 1 (negativo = mejor).
 * - Meta = la reducción % cargada en el plan (meta ÷ línea base − 1, −4 %).
 */

export interface PuntoDistribucion {
  /** $/HL de distribución de la ciudad. */
  ciudad: number
  /** $/HL de distribución de la red. */
  red: number
  indice: number
}

type Acum = { costo: number; hl: number }

function acumular(
  t: Territorio,
  meses: number[],
  ciudad: string | null,
): Acum {
  const set = new Set(meses)
  let costo = 0
  let hl = 0
  for (const c of t.ciudades) {
    if (ciudad != null && c.ciudad !== ciudad) continue
    for (const m of c.serie)
      if (m.anio === t.anio && set.has(m.mes)) {
        costo += m.costo_distribucion
        hl += m.hl
      }
  }
  return { costo, hl }
}

/** Distribución de la ciudad y de la red en esos meses. */
export function distribucionPeriodo(
  ciudad: string,
  t: Territorio | null,
  meses: number[],
): PuntoDistribucion | null {
  if (!t || !meses.length) return null
  const c = acumular(t, meses, ciudad)
  const r = acumular(t, meses, null)
  if (!c.hl || !r.hl || r.costo <= 0) return null
  const ciudadXHl = c.costo / c.hl
  const redXHl = r.costo / r.hl
  return { ciudad: ciudadXHl, red: redXHl, indice: ciudadXHl / redXHl }
}

/** Meses (1-12) de la línea base, si cae entera en el año del territorio. */
export function mesesBase(plan: PlanTerritorial, t: Territorio | null): number[] {
  if (!t || !plan.linea_base_desde || !plan.linea_base_hasta) return []
  const a1 = Number(plan.linea_base_desde.slice(0, 4))
  const a2 = Number(plan.linea_base_hasta.slice(0, 4))
  if (a1 !== t.anio || a2 !== t.anio) return []
  const m1 = Number(plan.linea_base_desde.slice(5, 7))
  const m2 = Number(plan.linea_base_hasta.slice(5, 7))
  const out: number[] = []
  for (let m = m1; m <= m2; m++) out.push(m)
  return out
}

/** La base del plan: la congelada si está, si no la calculada en vivo. */
export function baseDistribucion(
  plan: PlanTerritorial,
  t: Territorio | null,
): (PuntoDistribucion & { congelada: boolean }) | null {
  if (plan.base_dist_x_hl && plan.base_red_dist_x_hl) {
    return {
      ciudad: plan.base_dist_x_hl,
      red: plan.base_red_dist_x_hl,
      indice: plan.base_dist_x_hl / plan.base_red_dist_x_hl,
      congelada: true,
    }
  }
  const vivo = distribucionPeriodo(plan.ciudad, t, mesesBase(plan, t))
  return vivo ? { ...vivo, congelada: false } : null
}

/** Meta como reducción (ej. −0,04). null si el plan no tiene meta. */
export function metaReduccion(plan: PlanTerritorial): number | null {
  if (plan.meta == null || !plan.linea_base) return null
  return plan.meta / plan.linea_base - 1
}

/** Mejora del período contra la base (ej. −0,14 = 14 % mejor). */
export function mejoraPeriodo(
  plan: PlanTerritorial,
  t: Territorio | null,
  meses: number[],
): { punto: PuntoDistribucion; mejora: number; cumple: boolean | null } | null {
  const base = baseDistribucion(plan, t)
  const punto = distribucionPeriodo(plan.ciudad, t, meses)
  if (!base || !punto) return null
  const mejora = punto.indice / base.indice - 1
  const meta = metaReduccion(plan)
  return { punto, mejora, cumple: meta == null ? null : mejora <= meta }
}

/**
 * Para los escenarios (que trabajan en $/HL total): el $/HL total que tendría
 * la ciudad en el período si su distribución llegara a la meta. Almacén real
 * del período + índice meta × distribución de la red. Sin base o sin meta,
 * la meta en pesos cargada.
 */
export function metaTotalPeriodo(
  plan: PlanTerritorial,
  t: Territorio | null,
  meses: number[],
): number | null {
  const base = baseDistribucion(plan, t)
  const meta = metaReduccion(plan)
  const punto = distribucionPeriodo(plan.ciudad, t, meses)
  if (!t || !base || meta == null || !punto) return plan.meta
  const set = new Set(meses)
  const c = t.ciudades.find((x) => x.ciudad === plan.ciudad)
  let total = 0
  let dist = 0
  let hl = 0
  for (const m of c?.serie ?? [])
    if (m.anio === t.anio && set.has(m.mes)) {
      total += m.costo_total
      dist += m.costo_distribucion
      hl += m.hl
    }
  if (!hl) return plan.meta
  const almacenXHl = (total - dist) / hl
  return almacenXHl + base.indice * (1 + meta) * punto.red
}

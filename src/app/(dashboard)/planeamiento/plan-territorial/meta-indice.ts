import type { PlanTerritorial, Territorio } from "@/actions/plan-territorial"

/**
 * Meta de un plan territorial medida CONTRA LA RED (decidido el 13/11/2026).
 *
 * La línea base y la meta del plan se guardan en $/HL, pero toda la red se
 * encarece o abarata por cosas que el plan no controla (paritaria, inflación,
 * temporada, volumen): entre ene–abr y ago–oct de 2026 el $/HL de las ciudades
 * subió 31 %. Una meta fija en pesos del período base queda cada mes más lejos
 * aunque la ciudad mejore.
 *
 * Por eso la meta es un ÍNDICE: $/HL de la ciudad ÷ $/HL de la red en los
 * mismos meses. Índice base = el de los meses de la línea base; índice meta =
 * índice base × (meta ÷ línea base) — o sea, la misma reducción % que se cargó
 * en pesos (−4 % en Colón y Ramallo). La meta en pesos de un mes es el índice
 * meta × $/HL de la red de ese mes.
 *
 * "Red" acá es la suma de las CIUDADES (sólo lo entregado a PDV), la misma
 * cuenta del $/HL de cada ciudad, así el índice compara peras con peras. No es
 * el VLC/HL del Árbol (que suma el retiro en depósito).
 */

type Acum = { costo: number; hl: number }

function redPdvMeses(t: Territorio, meses: number[]): Acum {
  const set = new Set(meses)
  let costo = 0
  let hl = 0
  for (const c of t.ciudades)
    for (const m of c.serie)
      if (m.anio === t.anio && set.has(m.mes)) {
        costo += m.costo_total
        hl += m.hl
      }
  return { costo, hl }
}

function ciudadMeses(t: Territorio, ciudad: string, meses: number[]): Acum {
  const set = new Set(meses)
  const c = t.ciudades.find((x) => x.ciudad === ciudad)
  let costo = 0
  let hl = 0
  for (const m of c?.serie ?? [])
    if (m.anio === t.anio && set.has(m.mes)) {
      costo += m.costo_total
      hl += m.hl
    }
  return { costo, hl }
}

/** Meses (1-12) de la línea base, si cae entera en el año del territorio. */
function mesesBase(plan: PlanTerritorial, t: Territorio): number[] | null {
  if (!plan.linea_base_desde || !plan.linea_base_hasta) return null
  const a1 = Number(plan.linea_base_desde.slice(0, 4))
  const a2 = Number(plan.linea_base_hasta.slice(0, 4))
  if (a1 !== t.anio || a2 !== t.anio) return null
  const m1 = Number(plan.linea_base_desde.slice(5, 7))
  const m2 = Number(plan.linea_base_hasta.slice(5, 7))
  const out: number[] = []
  for (let m = m1; m <= m2; m++) out.push(m)
  return out
}

/**
 * Índice de la línea base y el índice meta del plan. null si no se puede
 * calcular (base fuera del año, sin meta o sin datos): en ese caso se usa la
 * meta en pesos tal cual.
 */
export function indicesPlan(
  plan: PlanTerritorial,
  t: Territorio | null,
): { base: number; meta: number } | null {
  if (!t || plan.meta == null || !plan.linea_base) return null
  const meses = mesesBase(plan, t)
  if (!meses) return null
  const c = ciudadMeses(t, plan.ciudad, meses)
  const r = redPdvMeses(t, meses)
  if (!c.hl || !r.hl || !r.costo) return null
  const base = c.costo / c.hl / (r.costo / r.hl)
  return { base, meta: base * (plan.meta / plan.linea_base) }
}

/** $/HL de la red (ciudades) en esos meses. */
export function redPdvCostoXHl(t: Territorio | null, meses: number[]): number | null {
  if (!t) return null
  const r = redPdvMeses(t, meses)
  return r.hl ? r.costo / r.hl : null
}

/**
 * Meta en $/HL del plan para un período (uno o varios meses): índice meta ×
 * $/HL de la red en esos meses. Sin índice, la meta en pesos cargada.
 */
export function metaPeriodo(
  plan: PlanTerritorial,
  t: Territorio | null,
  meses: number[],
): number | null {
  const idx = indicesPlan(plan, t)
  if (!idx) return plan.meta
  const red = redPdvCostoXHl(t, meses)
  return red == null ? plan.meta : idx.meta * red
}

/** Meta en $/HL de cada mes del territorio, para dibujarla en la serie. */
export function metaPorMes(
  plan: PlanTerritorial,
  t: Territorio | null,
): Map<number, number> {
  const out = new Map<number, number>()
  if (!t) return out
  for (const m of t.meses) {
    const v = metaPeriodo(plan, t, [m])
    if (v != null) out.set(m, v)
  }
  return out
}

/** Índice del período: $/HL de la ciudad ÷ $/HL de la red. */
export function indicePeriodo(
  ciudad: string,
  t: Territorio | null,
  meses: number[],
): number | null {
  if (!t) return null
  const c = ciudadMeses(t, ciudad, meses)
  const r = redPdvMeses(t, meses)
  if (!c.hl || !r.hl || !r.costo) return null
  return c.costo / c.hl / (r.costo / r.hl)
}

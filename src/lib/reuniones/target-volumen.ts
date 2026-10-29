// Target diario de volumen (HL y bultos vendidos) para la Matinal de
// Distribución y la Reunión de Logística (Pampeana). Pedido de la operación
// del 29/10/2026: el proyectado DISTRIBUIDO del mes de Planeamiento →
// Dimensionamiento (dim_volumen_proyectado × dim_config.pct_distribuido) se
// reparte entre los días hábiles según el peso real de cada día de la
// semana, en vez de un promedio diario plano.
//
//   target(d) = proyectado del mes × peso(día de d) / Σ peso de los días
//               hábiles del mes (lunes a sábado, sin feriados)
//   gatillo(d) = target(d) × GATILLO_PCT_TARGET
//
// Así un mes con 5 jueves no se pasa del proyectado y los feriados no
// reciben volumen. Los bultos salen de los HL con la relación bultos/HL real
// del mes anterior (el proyectado sólo existe en HL).

import { esFeriado } from "@/lib/feriados-ar"

/**
 * Peso de cada día de la semana (0 = domingo … 6 = sábado): venta promedio de
 * ese día / suma de los promedios, HL vendidos de mayo a octubre de 2026
 * (ventas_diarias, 150 días con venta). El domingo no se vende.
 */
export const PESO_DIA_VENTA: readonly number[] = [
  0, // domingo
  0.127, // lunes
  0.157, // martes
  0.172, // miércoles
  0.199, // jueves
  0.208, // viernes
  0.136, // sábado
]

/** Gatillo = 90% del target del día (amarillo entre 90% y 100%). */
export const GATILLO_PCT_TARGET = 0.9

export interface TargetDia {
  meta: number
  gatillo: number
}

function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

function pesoDe(fecha: string): number {
  return esFeriado(fecha) ? 0 : PESO_DIA_VENTA[diaSemana(fecha)] ?? 0
}

/**
 * Reparte `totalMes` entre las `fechas` del mes. Los días sin peso (domingo,
 * feriado) no tienen target. `decimales` redondea cada target del día.
 */
export function targetsDiarios(
  fechas: string[],
  totalMes: number,
  decimales: number,
): Record<string, TargetDia> {
  const suma = fechas.reduce((acc, f) => acc + pesoDe(f), 0)
  const out: Record<string, TargetDia> = {}
  if (!(suma > 0) || !(totalMes > 0)) return out
  const k = 10 ** decimales
  for (const f of fechas) {
    const p = pesoDe(f)
    if (p <= 0) continue
    const meta = (totalMes * p) / suma
    out[f] = {
      meta: Math.round(meta * k) / k,
      gatillo: Math.round(meta * GATILLO_PCT_TARGET * k) / k,
    }
  }
  return out
}

/** Target y gatillo acumulados hasta `hasta` inclusive (para pintar el MTD). */
export function targetAcumulado(
  targets: Record<string, TargetDia>,
  hasta: string,
): TargetDia | null {
  let meta = 0
  let gatillo = 0
  let hay = false
  for (const [f, t] of Object.entries(targets)) {
    if (f > hasta) continue
    meta += t.meta
    gatillo += t.gatillo
    hay = true
  }
  return hay ? { meta, gatillo } : null
}

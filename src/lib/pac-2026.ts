/**
 * PAC 2026 — Plan Anual de Capacitación aprobado (Cinia Morel, RRHH).
 *
 * Cantidad de capacitaciones planificadas por pilar y mes, tal como salen de la hoja
 * "Presup Capacitaciones Internas" de `Presupuesto PAC.xlsx` (fila "CANT CAPACITACIONES"
 * de cada bloque de pilar). Total aprobado: 90 capacitaciones.
 *
 * 🚨 Es una foto del plan aprobado: NO se regenera solo. Si Cinia reprograma el PAC,
 * hay que actualizar esta tabla a mano. El calendarizado real vive en la tabla
 * `capacitaciones` de la DB y es el que manda para medir adherencia; el PAC se usa
 * únicamente como segunda vara (cobertura del plan aprobado).
 */

import { IS_MISIONES } from "@/lib/empresa"

export const PAC_2026_ORIGEN = "Presupuesto PAC.xlsx — Cinia Morel (RRHH)"

/**
 * El PAC cargado acá es el de Región Pampeana. Misiones tiene su propio plan, así que
 * allá el cronograma se mide sólo contra lo calendarizado en el sistema.
 */
export const HAY_PAC = !IS_MISIONES

/** Meta de cumplimiento del calendarizado a fin de año. */
export const META_CUMPLIMIENTO = 0.9

/** Meses en índice 0-11 (Ene=0). Sólo se listan los pilares con plan. */
export const PAC_2026: Record<string, number[]> = {
  //              Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic
  Gente: /*     */ [0, 0, 0, 0, 0, 0, 1, 1, 9, 1, 0, 0],
  Entrega: /*   */ [0, 0, 0, 1, 0, 2, 2, 2, 2, 0, 0, 0],
  Almacen: /*   */ [0, 0, 0, 5, 2, 2, 5, 0, 3, 0, 0, 0],
  Flota: /*     */ [0, 0, 0, 0, 0, 0, 2, 0, 2, 2, 0, 0],
  Seguridad: /* */ [0, 0, 0, 0, 0, 2, 7, 7, 9, 7, 0, 0],
  Planeamiento: [0, 0, 0, 0, 0, 0, 3, 0, 2, 0, 0, 0],
  Gestion: /*   */ [0, 0, 0, 2, 0, 0, 2, 2, 2, 1, 0, 0],
}

/** Total planificado por el PAC en un mes (0-11). */
export function pacDelMes(mes: number): number {
  if (!HAY_PAC) return 0
  return Object.values(PAC_2026).reduce((acc, meses) => acc + (meses[mes] ?? 0), 0)
}

/** Total planificado por el PAC para un pilar en todo el año. */
export function pacDelPilar(pilar: string): number {
  if (!HAY_PAC) return 0
  return (PAC_2026[pilar] ?? []).reduce((acc, n) => acc + n, 0)
}

/** Total anual del PAC aprobado (90). */
export const PAC_2026_TOTAL = Object.values(PAC_2026).reduce(
  (acc, meses) => acc + meses.reduce((s, n) => s + n, 0),
  0
)

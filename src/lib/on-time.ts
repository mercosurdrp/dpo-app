/**
 * ON TIME — entregas en el día pactado (DPO Entrega 4.4).
 *
 *   On Time = 100 − (VRL + VRC) ÷ HL solicitados
 *
 * 🚨 Se publica COMPLEMENTADO (más es mejor), al revés que OTIF e In-Full, que
 * van como % de pérdida en el Árbol del Sueño. No es una inconsistencia: el
 * auditor DPO lee el On Time como "% que llegó a tiempo" y lo compara contra el
 * objetivo del año. La cuenta es la misma; cambia sólo cómo se presenta.
 *
 * 🚨 La "ventana horaria" del indicador es el DÍA de entrega pactado, no la
 * franja horaria de apertura del PDV (definición del usuario 2026-07-20). Es la
 * excepción Small Operations del checklist DPO 2.1: "se considera entrega dentro
 * del día solicitado". Si el auditor no la concede, hay que cruzar los timestamps
 * de Foxtrot contra la ventana relevada.
 *
 * El numerador es lo REPROGRAMADO: VRL (logístico, entrega_cortes) + VRC
 * (comercial, límite de crédito, en la Railway). El denominador es el mismo de
 * OTIF/In-Full: HL vendidos NETO (incluye mostrador) + rechazos + VRL + VRC.
 *
 * 🚨 Tipos y constantes viven ACÁ y no en el server action: un archivo
 * "use server" sólo puede exportar funciones async, y exportar una constante
 * rompe el build (no el typecheck).
 */

import type { CoberturaVh } from "@/lib/mercosur-dashboard"

/** Meta del indicador, en % de entregas a tiempo. */
export const META_ON_TIME = 99

/** Primer mes con medición real: el VRL arranca el 18/07/2026. */
export const ON_TIME_DESDE = { anio: 2026, mes: 7 }

/** Punto DPO Entrega 4.4 "ENTREGAS ON TIME" (key 5_2_26_84). */
export const PREGUNTA_44_ID = "abee84bc-9579-4e8e-9512-d6ce84f7f860"

export interface OnTimeMes {
  mes: number
  hlSolicitados: number
  hlVrl: number
  hlVrc: number | null
  /** VRL + VRC, los HL que se prometieron y se corrieron de fecha. */
  hlReprogramado: number
  /** 100 − reprogramado/solicitados×100. null = sin ventas en el mes. */
  onTimePct: number | null
  /** false = mes anterior al inicio del VRL: el 100% sería un espejismo. */
  medido: boolean
}

export interface OnTimeResumen {
  anio: number
  meses: OnTimeMes[]
  /** YTD ponderado por volumen, SOLO sobre los meses medidos. */
  onTimeYtd: number | null
  meta: number
  vrcDisponible: boolean
}

export interface OnTimeDatos {
  onTime: OnTimeResumen | null
  vh: CoberturaVh | null
  vhError: string | null
}

export type OnTimeResult = { data: OnTimeDatos } | { error: string }

export type CoberturaVhResult = { data: CoberturaVh | null } | { error: string }

/** true si el mes ya está dentro del período con registro de reprogramación. */
export function esMesMedido(anio: number, mes: number): boolean {
  return (
    anio > ON_TIME_DESDE.anio ||
    (anio === ON_TIME_DESDE.anio && mes >= ON_TIME_DESDE.mes)
  )
}

export function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

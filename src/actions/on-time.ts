"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { otifResumen } from "@/lib/sueno/otif"
import {
  consultarCoberturaVentanasHorarias,
  type CoberturaVh,
} from "@/lib/mercosur-dashboard"

// ===== ON TIME — entregas en el día pactado (DPO Entrega 4.4) ================
//
//   On Time = 100 − (VRL + VRC) ÷ HL solicitados
//
// 🚨 Se publica COMPLEMENTADO (más es mejor), al revés que OTIF e In-Full, que
// van como % de pérdida en el Árbol del Sueño. No es una inconsistencia: el
// auditor DPO lee el On Time como "% que llegó a tiempo" y lo compara contra el
// objetivo del año. La cuenta es la misma; cambia sólo cómo se presenta.
//
// 🚨 La "ventana horaria" del indicador es el DÍA de entrega pactado, no la
// franja horaria de apertura del PDV (definición del usuario 2026-07-20). Es la
// excepción Small Operations del checklist DPO 2.1: "se considera entrega dentro
// del día solicitado". Si el auditor no la concede, hay que cruzar los timestamps
// de Foxtrot contra la ventana relevada.
//
// El numerador es lo REPROGRAMADO: VRL (logístico, entrega_cortes) + VRC
// (comercial, límite de crédito, en la Railway). El denominador es el mismo de
// OTIF/In-Full: HL vendidos NETO (incluye mostrador) + rechazos + VRL + VRC.

/** Meta del indicador, en % de entregas a tiempo. */
export const META_ON_TIME = 99

/** Primer mes con medición real: el VRL arranca el 18/07/2026. */
export const ON_TIME_DESDE = { anio: 2026, mes: 7 }

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

export type OnTimeResult =
  | { data: { onTime: OnTimeResumen | null; vh: CoberturaVh | null; vhError: string | null } }
  | { error: string }

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Serie del On Time del año + cobertura de ventanas horarias.
 *
 * Los meses previos al inicio del VRL se marcan `medido: false` y quedan FUERA
 * del YTD: antes del 18/07/2026 no existía el registro de reprogramación, así
 * que darían 100% por falta de dato y no por buena performance.
 */
export async function getOnTime(anio: number): Promise<OnTimeResult> {
  await requireAuth()

  const supabase = await createClient()
  const otif = await otifResumen(supabase, anio)

  let onTime: OnTimeResumen | null = null
  if (otif) {
    const meses: OnTimeMes[] = otif.meses.map((m) => {
      const hlVrc = m.hlVrc ?? 0
      const hlReprogramado = m.hlVrl + hlVrc
      const medido =
        anio > ON_TIME_DESDE.anio ||
        (anio === ON_TIME_DESDE.anio && m.mes >= ON_TIME_DESDE.mes)
      return {
        mes: m.mes,
        hlSolicitados: m.hlSolicitados,
        hlVrl: m.hlVrl,
        hlVrc: m.hlVrc,
        hlReprogramado,
        onTimePct:
          m.hlSolicitados > 0
            ? redondear(100 - (hlReprogramado / m.hlSolicitados) * 100)
            : null,
        medido,
      }
    })

    // YTD ponderado por volumen y sólo sobre meses medidos: promediar los meses
    // haría pesar igual a julio que a un mes entero, y sumar los no medidos
    // metería 100% de relleno.
    const medidos = meses.filter((m) => m.medido)
    const solicitados = medidos.reduce((s, m) => s + m.hlSolicitados, 0)
    const reprogramado = medidos.reduce((s, m) => s + m.hlReprogramado, 0)

    onTime = {
      anio,
      meses,
      onTimeYtd:
        solicitados > 0
          ? redondear(100 - (reprogramado / solicitados) * 100)
          : null,
      meta: META_ON_TIME,
      vrcDisponible: otif.vrcDisponible,
    }
  }

  // La cobertura de VH degrada sola: si la Railway no responde se informa el
  // error y NUNCA un 0, que se leería como incumplimiento.
  let vh: CoberturaVh | null = null
  let vhError: string | null = null
  try {
    vh = await consultarCoberturaVentanasHorarias()
  } catch (e) {
    console.error("[on-time] error leyendo ventanas horarias:", e)
    vhError =
      e instanceof Error
        ? `No se pudo leer el relevamiento de horarios: ${e.message}`
        : "No se pudo leer el relevamiento de horarios."
  }

  return { data: { onTime, vh, vhError } }
}

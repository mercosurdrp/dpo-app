"use server"

// 🚨 Este archivo SOLO puede exportar funciones async ("use server").
// Los tipos, las constantes y el punto 4.4 viven en @/lib/on-time.

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { otifResumen } from "@/lib/sueno/otif"
import { consultarCoberturaVentanasHorarias } from "@/lib/mercosur-dashboard"
import type { CoberturaVh } from "@/lib/mercosur-dashboard"
import {
  META_ON_TIME,
  esMesMedido,
  redondear,
  type OnTimeMes,
  type OnTimeResult,
  type OnTimeResumen,
} from "@/lib/on-time"

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
        medido: esMesMedido(anio, m.mes),
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

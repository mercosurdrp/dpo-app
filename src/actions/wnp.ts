"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { cargarSerieWnp } from "@/lib/wnp/datos"
import type { WnpPersonaDia } from "@/lib/wnp/calculo"

export type WnpDetalleDia = {
  fecha: string
  /** HL vendidos del día = distribuido + mostrador prorrateado del mes. */
  hl: number
  horas: number
  wnp: number | null
  personas: WnpPersonaDia[]
  horasEstimadas: number
  incompleto: boolean
}

/**
 * Detalle del WNP de un día para el popover: cuánto HL, cuántas horas y de dónde
 * salió cada hora (fichaje real / jornada teórica por reloj caído / ausencia).
 * El prorrateo del mostrador es mensual, así que la serie se pide por el mes
 * entero aunque solo se muestre un día.
 */
export async function getWnpDetalleDia(
  fecha: string,
): Promise<{ data: WnpDetalleDia } | { error: string }> {
  try {
    await requireAuth()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Fecha inválida" }
    }
    const supabase = await createClient()

    const [anio, mes] = fecha.split("-")
    const desde = `${anio}-${mes}-01`
    const ultimoDia = new Date(Date.UTC(Number(anio), Number(mes), 0)).getUTCDate()
    const hasta = `${anio}-${mes}-${String(ultimoDia).padStart(2, "0")}`

    const serie = await cargarSerieWnp(supabase, desde, hasta)
    const dia = serie.porFecha[fecha]
    if (!dia) {
      return {
        data: {
          fecha, hl: 0, horas: 0, wnp: null,
          personas: [], horasEstimadas: 0, incompleto: false,
        },
      }
    }

    return {
      data: {
        fecha,
        hl: Math.round(dia.hl * 100) / 100,
        horas: Math.round(dia.horas * 100) / 100,
        wnp: dia.horas > 0 ? Math.round((dia.hl / dia.horas) * 100) / 100 : null,
        personas: dia.personas,
        horasEstimadas: Math.round(dia.horasEstimadas * 100) / 100,
        incompleto: dia.incompleto,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el detalle del WNP",
    }
  }
}

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getChoferesResumenMes as runResumen,
  type ChoferesResumenMes,
} from "@/lib/choferes/resumen-mes"
import {
  getChoferDetalle as runDetalle,
  type ChoferDetalle,
} from "@/lib/choferes/detalle-chofer"

export type { ChoferesResumenMes, ChoferResumenRow } from "@/lib/choferes/resumen-mes"
export type { ChoferDetalle, ChoferDetalleDia } from "@/lib/choferes/detalle-chofer"

export async function getChoferesResumenMes(
  fechaDesde: string,
  fechaHasta: string,
): Promise<{ data: ChoferesResumenMes } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runResumen(supa, fechaDesde, fechaHasta)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando resumen de choferes",
    }
  }
}

export async function getChoferDetalle(
  choferIdOrSentinel: string,
  fechaDesde: string,
  fechaHasta: string,
): Promise<{ data: ChoferDetalle } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runDetalle(supa, choferIdOrSentinel, fechaDesde, fechaHasta)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando detalle del chofer",
    }
  }
}

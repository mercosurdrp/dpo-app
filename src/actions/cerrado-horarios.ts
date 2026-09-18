"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  cerradoHorarioResumen,
  cerradoHorarioMensual,
  type CerradoHorarioMes,
  type CerradoHorarioResumen,
} from "@/lib/cerrado-horarios/resumen"

export interface CerradoHorarioDetalle {
  resumen: CerradoHorarioResumen | null
  meses: CerradoHorarioMes[]
}

/**
 * El detalle de CERRADO abierto por cumplimiento de horario, para el diálogo
 * del Árbol del Sueño.
 *
 * Lee la tabla ya materializada por el cron: no cruza nada en vivo.
 */
export async function getCerradoHorarioDetalle(
  anio: number,
): Promise<{ data: CerradoHorarioDetalle } | { error: string }> {
  await requireAuth()
  try {
    const supabase = await createClient()
    const [resumen, meses] = await Promise.all([
      cerradoHorarioResumen(supabase, anio),
      cerradoHorarioMensual(supabase, anio),
    ])
    return { data: { resumen, meses } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

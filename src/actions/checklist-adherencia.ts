"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  calcularAdherenciaChecklist,
  type AdherenciaChecklist,
} from "@/lib/vehiculos/checklist-adherencia"

// El cálculo vive en `@/lib/vehiculos/checklist-adherencia` porque lo comparten
// esta acción (la tarjeta del tablero) y el cron que fotografía el KPI mensual.
// Los tipos se re-exportan para no romper los imports que ya existen.
export type {
  AdherenciaChecklist,
  AdherenciaPunto,
  AdherenciaUnidad,
  DiaFaltante,
} from "@/lib/vehiculos/checklist-adherencia"

export async function getAdherenciaChecklist(
  desde: string,
  hasta: string,
): Promise<{ data: AdherenciaChecklist } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    return { data: await calcularAdherenciaChecklist(supabase, desde, hasta) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

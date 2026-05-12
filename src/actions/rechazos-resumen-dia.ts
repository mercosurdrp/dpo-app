"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getRechazosResumenDia as runResumen,
  type RechazosResumenDia,
} from "@/lib/rechazos/resumen-dia"

export type { RechazosResumenDia } from "@/lib/rechazos/resumen-dia"

export async function getRechazosResumenDia(
  fecha: string,
): Promise<{ data: RechazosResumenDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runResumen(supa, fecha)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando resumen de rechazos",
    }
  }
}

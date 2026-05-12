"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getVentasResumenDia as runResumen,
  type VentasResumenDia,
} from "@/lib/ventas/resumen-dia"

export type { VentasResumenDia } from "@/lib/ventas/resumen-dia"

export async function getVentasResumenDia(
  fecha: string,
): Promise<{ data: VentasResumenDia } | { error: string }> {
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
          : "Error cargando resumen de ventas",
    }
  }
}

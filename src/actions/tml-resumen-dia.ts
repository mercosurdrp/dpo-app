"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getTmlResumenDia as runResumen,
  type TmlResumenDia,
} from "@/lib/tml/resumen-dia"

export type { TmlResumenDia } from "@/lib/tml/resumen-dia"

export async function getTmlResumenDia(
  fecha: string,
): Promise<{ data: TmlResumenDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runResumen(supa, fecha)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando resumen de TML",
    }
  }
}

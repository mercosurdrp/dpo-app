"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getBultosPorDia as runSerie,
  type BultosPorDia,
} from "@/lib/ventas/bultos-por-dia"

export type { BultosPorDia, BultosDiaPunto } from "@/lib/ventas/bultos-por-dia"

export async function getBultosPorDia(
  desde: string,
  hasta: string,
): Promise<{ data: BultosPorDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runSerie(supa, desde, hasta)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando bultos por día",
    }
  }
}

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getBultosDiaPatentes as runDetalle,
  type BultosDiaPatentes,
} from "@/lib/ventas/bultos-dia-patentes"

export type { BultosDiaPatentes, BultosPatenteDia } from "@/lib/ventas/bultos-dia-patentes"

export async function getBultosDiaPatentes(
  fecha: string,
): Promise<{ data: BultosDiaPatentes } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runDetalle(supa, fecha)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando detalle de patentes del día",
    }
  }
}

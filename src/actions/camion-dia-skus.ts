"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  getCamionDiaSkus as runDetalle,
  type CamionDiaSkus,
} from "@/lib/ventas/camion-dia-skus"

export type { CamionDiaSkus, CamionSkuRow } from "@/lib/ventas/camion-dia-skus"

export async function getCamionDiaSkus(
  fecha: string,
  fletero: string,
): Promise<{ data: CamionDiaSkus } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await runDetalle(supa, fecha, fletero)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando SKUs del camión",
    }
  }
}

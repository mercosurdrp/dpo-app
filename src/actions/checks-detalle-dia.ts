"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  buildCloudfleetChecksDetalleDia,
  type CloudfleetChecksDetalleDia,
} from "@/lib/cloudfleet/checks-serie"
import type { MisionesSucursal } from "@/lib/foxtrot/auto-indicadores-misiones"

/**
 * Detalle por camión de los checks de Cloudfleet de un día (liberación +
 * retorno), para el popup del tablero de reuniones de logística (Misiones).
 * `sucursal` debe ser la misma del toggle para que cuadre con la celda.
 */
export async function getChecksDetalleDia(
  fecha: string,
  sucursal: MisionesSucursal = "todo",
): Promise<{ data: CloudfleetChecksDetalleDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()
    const data = await buildCloudfleetChecksDetalleDia(supa, fecha, sucursal)
    return { data }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando el detalle de checks",
    }
  }
}

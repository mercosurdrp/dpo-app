"use server"

import { createClient } from "@/lib/supabase/server"
import { getRechazosDetalle as runDetalle } from "@/lib/rechazos/detalle"
import type {
  RechazosDetalleRequest,
  RechazosDetalleResponse,
} from "@/lib/types/rechazos"

export async function getRechazosDetalle(
  request: RechazosDetalleRequest,
): Promise<RechazosDetalleResponse> {
  const supa = await createClient()
  return runDetalle(supa, request)
}

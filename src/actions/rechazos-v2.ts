"use server"

import { createClient } from "@/lib/supabase/server"
import { getRechazosComparado as runComparado } from "@/lib/rechazos/comparado"
import type { RechazosComparadoRequest, RechazosComparadoResult } from "@/lib/types/rechazos"

export async function getRechazosComparado(
  request: RechazosComparadoRequest,
): Promise<RechazosComparadoResult> {
  const supa = await createClient()
  return runComparado(supa, request)
}

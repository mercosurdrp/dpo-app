"use server"

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/session"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  CLAVE_COSTO_CONFIG,
  parseCostoConfig,
  type CostoConfig,
} from "@/lib/capacitacion-costo"

/**
 * Parámetros del presupuesto de costo (sueldos por pilar, horas, escenario,
 * presupuesto oficial). Tienen sueldos: sólo admin/auditor los leen, y se leen
 * con el cliente admin después de validar el rol.
 */
export async function getCostoConfig(): Promise<{ data: CostoConfig } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const admin = createAdminClient()
    const { data } = await admin
      .from("app_config")
      .select("valor")
      .eq("clave", CLAVE_COSTO_CONFIG)
      .maybeSingle()
    return { data: parseCostoConfig((data as { valor: string } | null)?.valor) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error leyendo el presupuesto de costo" }
  }
}

export async function saveCostoConfig(
  cfg: CostoConfig
): Promise<{ data: CostoConfig } | { error: string }> {
  try {
    await requireRole(["admin"])
    // Se normaliza antes de guardar: lo que venga roto queda en el default.
    const limpio = parseCostoConfig(JSON.stringify(cfg))
    const admin = createAdminClient()
    const { error } = await admin.from("app_config").upsert(
      {
        clave: CLAVE_COSTO_CONFIG,
        valor: JSON.stringify(limpio),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clave" }
    )
    if (error) return { error: error.message }
    revalidatePath("/capacitaciones")
    return { data: limpio }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando el presupuesto de costo" }
  }
}

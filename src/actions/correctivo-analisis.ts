"use server"

// Análisis de incidencias de correctivo por sistema (DPO Flota 2.4 / R2.4.2).
//
// La estratificación la calcula el cliente con la lib pura
// (`src/lib/flota/correctivo-analisis.ts`) sobre las 24 meses de OT que la
// pantalla ya tiene. Lo que sí vive en la base es la parte humana del
// análisis: por cada sistema, la CONCLUSIÓN escrita y la ACCIÓN de fondo con
// su estado. Es el "y qué hicieron" que sigue al número, y es distinto del
// plan de cada OT: acá va la contramedida (una tarea nueva en el preventivo,
// un ANS con el taller, un cambio de proveedor), no la reparación puntual.
// Misma idea que `checklist_item_analisis` para los ítems del checklist.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type { MantenimientoSistema } from "@/types/database"

export interface AnalisisSistema {
  sistema: MantenimientoSistema
  observacion: string | null
  planAccion: string | null
  planEstado: "en_curso" | "cerrado" | null
  planAt: string | null
  updatedAt: string | null
}

function faltaTabla(error: { code?: string | null; message?: string | null }): boolean {
  return error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "")
}

/** Conclusiones y acciones por sistema. `sqlPendiente` = la tabla no existe todavía. */
export async function getAnalisisCorrectivos(): Promise<
  { data: { items: AnalisisSistema[]; sqlPendiente: boolean } } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.from("correctivo_sistema_analisis").select("*")
    if (error) {
      if (faltaTabla(error)) return { data: { items: [], sqlPendiente: true } }
      return { error: error.message }
    }
    const items = ((data || []) as Array<{
      sistema: MantenimientoSistema
      observacion: string | null
      plan_accion: string | null
      plan_estado: "en_curso" | "cerrado" | null
      plan_at: string | null
      updated_at: string | null
    }>).map((r) => ({
      sistema: r.sistema,
      observacion: r.observacion,
      planAccion: r.plan_accion,
      planEstado: r.plan_estado,
      planAt: r.plan_at,
      updatedAt: r.updated_at,
    }))
    return { data: { items, sqlPendiente: false } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Guarda la conclusión y/o la acción de un sistema. Texto vacío borra ese
 * campo pero conserva el otro; el estado del plan sólo tiene sentido con plan.
 */
export async function setAnalisisSistema(input: {
  sistema: MantenimientoSistema
  observacion?: string | null
  planAccion?: string | null
  planEstado?: "en_curso" | "cerrado" | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const ahora = new Date().toISOString()
    const row: Record<string, unknown> = { sistema: input.sistema, updated_at: ahora, updated_by: profile.id }
    if (input.observacion !== undefined) row.observacion = input.observacion?.trim() || null
    if (input.planAccion !== undefined) {
      const plan = input.planAccion?.trim() || null
      row.plan_accion = plan
      row.plan_estado = plan ? (input.planEstado ?? "en_curso") : null
      row.plan_at = plan ? ahora : null
      row.plan_by = plan ? profile.id : null
    } else if (input.planEstado !== undefined) {
      row.plan_estado = input.planEstado
    }
    const { error } = await supabase
      .from("correctivo_sistema_analisis")
      .upsert(row, { onConflict: "sistema" })
    if (error) {
      if (faltaTabla(error))
        return { error: "Falta aplicar APLICAR_EN_PAMPEANA_CORRECTIVO_2_4.sql para guardar el análisis." }
      return { error: error.message }
    }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

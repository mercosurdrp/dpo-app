import type { SupabaseClient } from "@supabase/supabase-js"
import type { DpoActividadTipo } from "@/types/database"

interface RegisterActivityInput {
  tipo: DpoActividadTipo
  titulo: string
  descripcion?: string
  pilar_codigo?: string
  punto_codigo?: string
  requisito_codigo?: string
  archivo_id?: string
  referencia_id?: string
  referencia_tipo?: string
  user_id?: string
  user_nombre?: string
  metadata?: Record<string, unknown>
}

export async function registerActivity(
  supabase: SupabaseClient,
  input: RegisterActivityInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("dpo_actividad").insert({
      tipo: input.tipo,
      titulo: input.titulo,
      descripcion: input.descripcion ?? null,
      pilar_codigo: input.pilar_codigo ?? null,
      punto_codigo: input.punto_codigo ?? null,
      requisito_codigo: input.requisito_codigo ?? null,
      archivo_id: input.archivo_id ?? null,
      referencia_id: input.referencia_id ?? null,
      referencia_tipo: input.referencia_tipo ?? null,
      user_id: input.user_id ?? null,
      user_nombre: input.user_nombre ?? null,
      metadata: input.metadata ?? null,
    })
    if (error) {
      // WHY: never block caller on activity log failure
      console.error("[dpo-activity] insert failed:", error.message)
    }
  } catch (e) {
    console.error("[dpo-activity] unexpected error:", e)
  }
}

"use server"

// Devolución de Auditoría DPO (H1 2026): la devolución del auditor por
// pilar/pregunta separada en tareas accionables. Cada tarea tiene un check de
// resuelta y, como plan de acción, responsable + fecha límite opcionales.
// Seed: APLICAR_EN_PAMPEANA_DEVOLUCION_H1.sql (parsea la col. K del Excel).

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

export interface DevolucionTarea {
  id: string
  pregunta_id: string
  descripcion: string
  orden: number
  resuelta: boolean
  resuelta_at: string | null
  responsable: string | null
  fecha_limite: string | null
  notas: string | null
}

export interface DevolucionPregunta {
  id: string
  periodo: string
  pilar: string
  bloque: string
  numero: string
  pregunta: string
  mandatoria: boolean
  nota: string
  comentario: string | null
  orden: number
  tareas: DevolucionTarea[]
}

export async function getDevolucion(
  periodo = "H1 2026"
): Promise<{ data: DevolucionPregunta[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [pregRes, tareasRes] = await Promise.all([
      supabase
        .from("devolucion_preguntas")
        .select("*")
        .eq("periodo", periodo)
        .order("pilar")
        .order("orden"),
      supabase
        .from("devolucion_tareas")
        .select(
          "id, pregunta_id, descripcion, orden, resuelta, resuelta_at, responsable, fecha_limite, notas"
        )
        .order("orden")
        .limit(2000),
    ])
    if (pregRes.error) return { error: pregRes.error.message }
    if (tareasRes.error) return { error: tareasRes.error.message }

    const porPregunta = new Map<string, DevolucionTarea[]>()
    for (const t of (tareasRes.data ?? []) as DevolucionTarea[]) {
      const arr = porPregunta.get(t.pregunta_id) ?? []
      arr.push(t)
      porPregunta.set(t.pregunta_id, arr)
    }
    const data = ((pregRes.data ?? []) as Omit<DevolucionPregunta, "tareas">[]).map((p) => ({
      ...p,
      tareas: porPregunta.get(p.id) ?? [],
    }))
    return { data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function toggleTareaResuelta(
  tareaId: string,
  resuelta: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("devolucion_tareas")
      .update({
        resuelta,
        resuelta_at: resuelta ? new Date().toISOString() : null,
        resuelta_por: resuelta ? profile.id : null,
      })
      .eq("id", tareaId)
    if (error) return { error: error.message }
    revalidatePath("/devolucion")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function updateTareaPlan(
  tareaId: string,
  plan: { responsable: string | null; fecha_limite: string | null; notas: string | null }
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("devolucion_tareas")
      .update({
        responsable: plan.responsable?.trim() || null,
        fecha_limite: plan.fecha_limite || null,
        notas: plan.notas?.trim() || null,
      })
      .eq("id", tareaId)
    if (error) return { error: error.message }
    revalidatePath("/devolucion")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function addTarea(
  preguntaId: string,
  descripcion: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireAuth()
    const desc = descripcion.trim()
    if (!desc) return { error: "La descripción no puede estar vacía" }
    const supabase = await createClient()
    const { data: max } = await supabase
      .from("devolucion_tareas")
      .select("orden")
      .eq("pregunta_id", preguntaId)
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase.from("devolucion_tareas").insert({
      pregunta_id: preguntaId,
      descripcion: desc,
      orden: (max?.orden ?? 0) + 1,
    })
    if (error) return { error: error.message }
    revalidatePath("/devolucion")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function deleteTarea(tareaId: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase.from("devolucion_tareas").delete().eq("id", tareaId)
    if (error) return { error: error.message }
    revalidatePath("/devolucion")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

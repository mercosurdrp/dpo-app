"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { Auditoria, EstadoAuditoria } from "@/types/database"

export async function getAuditorias(): Promise<
  { data: Auditoria[] } | { error: string }
> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("auditorias")
      .select("*")
      .order("fecha_inicio", { ascending: false })

    if (error) return { error: error.message }
    return { data: data as Auditoria[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading auditorias" }
  }
}

export async function getAuditoria(
  id: string
): Promise<
  { data: Auditoria & { pilarProgress: Array<{ pilarId: string; pilarNombre: string; total: number; answered: number }> } }
  | { error: string }
> {
  try {
    const supabase = await createClient()

    const { data: auditoria, error } = await supabase
      .from("auditorias")
      .select("*")
      .eq("id", id)
      .single()

    if (error) return { error: error.message }

    // Get pilar progress
    const { data: pilares } = await supabase
      .from("pilares")
      .select("*")
      .order("orden")

    const { data: bloques } = await supabase
      .from("bloques")
      .select("id, pilar_id")

    const { data: preguntas } = await supabase
      .from("preguntas")
      .select("id, bloque_id")

    const { data: respuestas } = await supabase
      .from("respuestas")
      .select("pregunta_id, puntaje")
      .eq("auditoria_id", id)

    const bloquesArr = (bloques ?? []) as { id: string; pilar_id: string }[]
    const preguntasArr = (preguntas ?? []) as { id: string; bloque_id: string }[]
    const respuestasArr = (respuestas ?? []) as { pregunta_id: string; puntaje: number | null }[]

    const answeredSet = new Set(
      respuestasArr.filter((r) => r.puntaje !== null).map((r) => r.pregunta_id)
    )

    const bloquesByPilar = new Map<string, string[]>()
    for (const b of bloquesArr) {
      const list = bloquesByPilar.get(b.pilar_id) ?? []
      list.push(b.id)
      bloquesByPilar.set(b.pilar_id, list)
    }

    const preguntasByBloque = new Map<string, string[]>()
    for (const p of preguntasArr) {
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(p.id)
      preguntasByBloque.set(p.bloque_id, list)
    }

    const pilarProgress = ((pilares ?? []) as { id: string; nombre: string }[]).map((pilar) => {
      const bloqueIds = bloquesByPilar.get(pilar.id) ?? []
      const preguntaIds: string[] = []
      for (const bid of bloqueIds) {
        preguntaIds.push(...(preguntasByBloque.get(bid) ?? []))
      }
      const answered = preguntaIds.filter((pid) => answeredSet.has(pid)).length

      return {
        pilarId: pilar.id,
        pilarNombre: pilar.nombre,
        total: preguntaIds.length,
        answered,
      }
    })

    return { data: { ...(auditoria as Auditoria), pilarProgress } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading auditoria" }
  }
}

export async function createAuditoria(data: {
  nombre: string
  fecha_inicio: string
  fecha_fin?: string
}): Promise<{ data: Auditoria } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: auditoria, error } = await supabase
      .from("auditorias")
      .insert({
        nombre: data.nombre,
        fecha_inicio: data.fecha_inicio,
        fecha_fin: data.fecha_fin ?? null,
        estado: "borrador" as EstadoAuditoria,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: auditoria as Auditoria }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating auditoria" }
  }
}

export async function updateAuditoriaEstado(
  id: string,
  estado: EstadoAuditoria
): Promise<{ data: Auditoria } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("auditorias")
      .update({ estado })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as Auditoria }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating auditoria estado" }
  }
}

export async function deleteAuditoria(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("auditorias")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting auditoria" }
  }
}

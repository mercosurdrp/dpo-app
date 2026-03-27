"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { Accion } from "@/types/database"

interface AccionEnriquecida extends Accion {
  pregunta_texto: string
  pregunta_numero: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
}

export async function getAcciones(
  filters?: { estado?: string; pilarId?: string; auditoriaId?: string }
): Promise<{ data: AccionEnriquecida[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get acciones with joined respuesta data
    let query = supabase
      .from("acciones")
      .select(
        "*, respuestas!inner(id, auditoria_id, pregunta_id, preguntas!inner(id, numero, texto, bloque_id, bloques!inner(id, nombre, pilar_id, pilares!inner(id, nombre, color))))"
      )
      .order("created_at", { ascending: false })

    if (filters?.estado) {
      query = query.eq("estado", filters.estado)
    }

    if (filters?.auditoriaId) {
      query = query.eq("respuestas.auditoria_id", filters.auditoriaId)
    }

    if (filters?.pilarId) {
      query = query.eq(
        "respuestas.preguntas.bloques.pilar_id",
        filters.pilarId
      )
    }

    const { data, error } = await query

    if (error) {
      // Fallback: simpler query without deep joins if the nested filter fails
      const { data: acciones, error: fallbackErr } = await supabase
        .from("acciones")
        .select("*")
        .order("created_at", { ascending: false })

      if (fallbackErr) return { error: fallbackErr.message }

      // Enrich manually
      const enriched: AccionEnriquecida[] = []
      for (const accion of (acciones ?? []) as Accion[]) {
        const { data: resp } = await supabase
          .from("respuestas")
          .select("id, auditoria_id, pregunta_id")
          .eq("id", accion.respuesta_id)
          .single()

        if (!resp) continue

        if (filters?.auditoriaId && resp.auditoria_id !== filters.auditoriaId) continue

        const { data: pregunta } = await supabase
          .from("preguntas")
          .select("id, numero, texto, bloque_id")
          .eq("id", resp.pregunta_id)
          .single()

        if (!pregunta) continue

        const { data: bloque } = await supabase
          .from("bloques")
          .select("id, nombre, pilar_id")
          .eq("id", pregunta.bloque_id)
          .single()

        if (!bloque) continue

        if (filters?.pilarId && bloque.pilar_id !== filters.pilarId) continue

        const { data: pilar } = await supabase
          .from("pilares")
          .select("id, nombre, color")
          .eq("id", bloque.pilar_id)
          .single()

        if (!pilar) continue

        if (filters?.estado && accion.estado !== filters.estado) continue

        enriched.push({
          ...accion,
          pregunta_texto: pregunta.texto,
          pregunta_numero: pregunta.numero,
          bloque_nombre: bloque.nombre,
          pilar_id: pilar.id,
          pilar_nombre: pilar.nombre,
          pilar_color: pilar.color,
        })
      }

      return { data: enriched }
    }

    // Map nested join result to flat structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: AccionEnriquecida[] = ((data ?? []) as any[]).map((row) => {
      const resp = row.respuestas
      const pregunta = resp?.preguntas
      const bloque = pregunta?.bloques
      const pilar = bloque?.pilares

      return {
        id: row.id,
        respuesta_id: row.respuesta_id,
        descripcion: row.descripcion,
        responsable: row.responsable,
        fecha_limite: row.fecha_limite,
        estado: row.estado,
        evidencia_urls: row.evidencia_urls,
        created_at: row.created_at,
        updated_at: row.updated_at,
        pregunta_texto: pregunta?.texto ?? "",
        pregunta_numero: pregunta?.numero ?? "",
        bloque_nombre: bloque?.nombre ?? "",
        pilar_id: pilar?.id ?? "",
        pilar_nombre: pilar?.nombre ?? "",
        pilar_color: pilar?.color ?? "",
      }
    })

    return { data: enriched }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading acciones" }
  }
}

export async function createAccion(data: {
  respuestaId: string
  descripcion: string
  responsable: string
  fecha_limite: string
}): Promise<{ data: Accion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: accion, error } = await supabase
      .from("acciones")
      .insert({
        respuesta_id: data.respuestaId,
        descripcion: data.descripcion,
        responsable: data.responsable,
        fecha_limite: data.fecha_limite,
        estado: "pendiente",
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: accion as Accion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating accion" }
  }
}

export async function updateAccion(
  id: string,
  data: Partial<{
    descripcion: string
    responsable: string
    fecha_limite: string
    estado: string
  }>
): Promise<{ data: Accion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: accion, error } = await supabase
      .from("acciones")
      .update(data)
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: accion as Accion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating accion" }
  }
}

export async function deleteAccion(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("acciones")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting accion" }
  }
}

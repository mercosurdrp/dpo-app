"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  Sugerencia,
  SugerenciaConAutor,
  SugerenciaDetalle,
  SugerenciaComentarioConAutor,
  SugerenciaTipo,
  SugerenciaEstado,
  SugerenciaPrioridad,
} from "@/types/database"

const DASHBOARD_PATH = "/sugerencias"

// ===================================================
// Lectura
// ===================================================

export async function getSugerencias(): Promise<
  { data: SugerenciaConAutor[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("sugerencias")
      .select(
        "*, autor:profiles!sugerencias_creado_por_fkey(id, nombre), asignado:profiles!sugerencias_asignado_a_fkey(id, nombre)"
      )
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: SugerenciaConAutor[] = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      tipo: row.tipo,
      estado: row.estado,
      prioridad: row.prioridad,
      modulo: row.modulo,
      creado_por: row.creado_por,
      asignado_a: row.asignado_a,
      motivo_rechazo: row.motivo_rechazo,
      created_at: row.created_at,
      updated_at: row.updated_at,
      autor_nombre: row.autor?.nombre ?? "Desconocido",
      asignado_nombre: row.asignado?.nombre ?? null,
    }))

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando sugerencias",
    }
  }
}

export async function getSugerencia(
  id: string
): Promise<{ data: SugerenciaDetalle } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: sug, error } = await supabase
      .from("sugerencias")
      .select(
        "*, autor:profiles!sugerencias_creado_por_fkey(id, nombre), asignado:profiles!sugerencias_asignado_a_fkey(id, nombre)"
      )
      .eq("id", id)
      .single()

    if (error || !sug) {
      return { error: error?.message ?? "Sugerencia no encontrada" }
    }

    const { data: coms, error: errComs } = await supabase
      .from("sugerencia_comentarios")
      .select("*, autor:profiles!sugerencia_comentarios_autor_id_fkey(id, nombre)")
      .eq("sugerencia_id", id)
      .order("created_at", { ascending: true })

    if (errComs) return { error: errComs.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = sug as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comentarios: SugerenciaComentarioConAutor[] = ((coms ?? []) as any[]).map(
      (c) => ({
        id: c.id,
        sugerencia_id: c.sugerencia_id,
        autor_id: c.autor_id,
        texto: c.texto,
        created_at: c.created_at,
        autor_nombre: c.autor?.nombre ?? "Desconocido",
      })
    )

    const detalle: SugerenciaDetalle = {
      id: row.id,
      titulo: row.titulo,
      descripcion: row.descripcion,
      tipo: row.tipo,
      estado: row.estado,
      prioridad: row.prioridad,
      modulo: row.modulo,
      creado_por: row.creado_por,
      asignado_a: row.asignado_a,
      motivo_rechazo: row.motivo_rechazo,
      created_at: row.created_at,
      updated_at: row.updated_at,
      autor_nombre: row.autor?.nombre ?? "Desconocido",
      asignado_nombre: row.asignado?.nombre ?? null,
      comentarios,
    }

    return { data: detalle }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando sugerencia",
    }
  }
}

// ===================================================
// Mutaciones
// ===================================================

interface CreateSugerenciaInput {
  titulo: string
  descripcion: string
  tipo: SugerenciaTipo
  modulo?: string
}

export async function createSugerencia(
  input: CreateSugerenciaInput
): Promise<{ data: Sugerencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!input.titulo.trim() || !input.descripcion.trim()) {
      return { error: "Título y descripción son obligatorios" }
    }

    const { data, error } = await supabase
      .from("sugerencias")
      .insert({
        titulo: input.titulo.trim(),
        descripcion: input.descripcion.trim(),
        tipo: input.tipo,
        modulo: input.modulo?.trim() || null,
        creado_por: profile.id,
        estado: "nuevo",
        prioridad: "media",
      })
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as Sugerencia }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando sugerencia",
    }
  }
}

interface UpdateSugerenciaInput {
  titulo?: string
  descripcion?: string
  tipo?: SugerenciaTipo
  modulo?: string | null
}

export async function updateSugerencia(
  id: string,
  input: UpdateSugerenciaInput
): Promise<{ data: Sugerencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Trae sugerencia para validar permisos
    const { data: actual, error: errGet } = await supabase
      .from("sugerencias")
      .select("creado_por, estado")
      .eq("id", id)
      .single()

    if (errGet || !actual) {
      return { error: errGet?.message ?? "Sugerencia no encontrada" }
    }

    const isAdmin = profile.role === "admin"
    const isAutor = actual.creado_por === profile.id
    const canEditContent = isAdmin || (isAutor && actual.estado === "nuevo")

    if (!canEditContent) {
      return {
        error: "Sólo el autor puede editar mientras el estado sea 'nuevo'.",
      }
    }

    const patch: Record<string, unknown> = {}
    if (input.titulo !== undefined) patch.titulo = input.titulo.trim()
    if (input.descripcion !== undefined) patch.descripcion = input.descripcion.trim()
    if (input.tipo !== undefined) patch.tipo = input.tipo
    if (input.modulo !== undefined) patch.modulo = input.modulo?.trim() || null

    if (Object.keys(patch).length === 0) {
      return { error: "Nada que actualizar" }
    }

    const { data, error } = await supabase
      .from("sugerencias")
      .update(patch)
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as Sugerencia }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando sugerencia",
    }
  }
}

export async function updateEstado(
  id: string,
  nuevoEstado: SugerenciaEstado,
  motivoRechazo?: string
): Promise<{ data: Sugerencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Trae sugerencia
    const { data: actual, error: errGet } = await supabase
      .from("sugerencias")
      .select("creado_por, estado")
      .eq("id", id)
      .single()

    if (errGet || !actual) {
      return { error: errGet?.message ?? "Sugerencia no encontrada" }
    }

    const isAdmin = profile.role === "admin"
    const isAutor = actual.creado_por === profile.id
    const autorPuedeConfirmar =
      isAutor && actual.estado === "en_testeo" && nuevoEstado === "ok"

    if (!isAdmin && !autorPuedeConfirmar) {
      return {
        error:
          "Sólo un admin puede cambiar el estado. El autor únicamente puede confirmar 'OK' cuando el ticket está 'En testeo'.",
      }
    }

    if (nuevoEstado === "rechazado") {
      if (!isAdmin) {
        return { error: "Sólo un admin puede rechazar una sugerencia." }
      }
      if (!motivoRechazo?.trim()) {
        return { error: "El motivo de rechazo es obligatorio." }
      }
    }

    const patch: Record<string, unknown> = { estado: nuevoEstado }
    if (nuevoEstado === "rechazado") {
      patch.motivo_rechazo = motivoRechazo!.trim()
    }

    const { data, error } = await supabase
      .from("sugerencias")
      .update(patch)
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as Sugerencia }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cambiando estado",
    }
  }
}

export async function setPrioridad(
  id: string,
  prioridad: SugerenciaPrioridad
): Promise<{ data: Sugerencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede cambiar la prioridad." }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("sugerencias")
      .update({ prioridad })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as Sugerencia }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error seteando prioridad",
    }
  }
}

export async function setAsignado(
  id: string,
  profileId: string | null
): Promise<{ data: Sugerencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede asignar sugerencias." }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("sugerencias")
      .update({ asignado_a: profileId })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: data as Sugerencia }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error asignando sugerencia",
    }
  }
}

export async function addComentario(
  sugerenciaId: string,
  texto: string
): Promise<{ data: SugerenciaComentarioConAutor } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const trimmed = texto.trim()
    if (!trimmed) return { error: "El comentario no puede estar vacío" }

    const { data, error } = await supabase
      .from("sugerencia_comentarios")
      .insert({
        sugerencia_id: sugerenciaId,
        autor_id: profile.id,
        texto: trimmed,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    const comentario: SugerenciaComentarioConAutor = {
      id: data.id,
      sugerencia_id: data.sugerencia_id,
      autor_id: data.autor_id,
      texto: data.texto,
      created_at: data.created_at,
      autor_nombre: profile.nombre,
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: comentario }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error agregando comentario",
    }
  }
}

export async function deleteSugerencia(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede eliminar sugerencias." }
    }

    const supabase = await createClient()
    const { error } = await supabase.from("sugerencias").delete().eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando sugerencia",
    }
  }
}

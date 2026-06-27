"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import type { AgendaEvento, AgendaEventoInput } from "@/lib/agenda"
import { CATEGORIAS } from "@/lib/agenda"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

const ROLES_AGENDA = ["admin", "supervisor"] as const

const COLUMNS =
  "id, titulo, descripcion, fecha, todo_el_dia, hora_inicio, hora_fin, categoria, responsable, ubicacion, creado_por, created_at, updated_at"

/** Normaliza/valida el payload del formulario antes de escribir. */
function sanitizar(input: AgendaEventoInput): AgendaEventoInput | string {
  const titulo = input.titulo?.trim()
  if (!titulo) return "El título es obligatorio."
  if (!input.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha))
    return "La fecha no es válida."
  if (!(input.categoria in CATEGORIAS)) return "Categoría inválida."

  const todoElDia = Boolean(input.todo_el_dia)
  const horaInicio = todoElDia ? null : input.hora_inicio || null
  const horaFin = todoElDia ? null : input.hora_fin || null
  if (horaInicio && horaFin && horaFin < horaInicio)
    return "La hora de fin no puede ser anterior a la de inicio."

  return {
    titulo,
    descripcion: input.descripcion?.trim() || null,
    fecha: input.fecha,
    todo_el_dia: todoElDia,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    categoria: input.categoria,
    responsable: input.responsable?.trim() || null,
    ubicacion: input.ubicacion?.trim() || null,
  }
}

// ============================================================================
// Listado por rango de fechas (el calendario precarga el mes visible)
// ============================================================================
export async function listarEventosEnRango(
  desde: string,
  hasta: string,
): Promise<Result<AgendaEvento[]>> {
  try {
    await requireRole([...ROLES_AGENDA])
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("agenda_eventos")
      .select(COLUMNS)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true, nullsFirst: true })

    if (error) return { error: error.message }
    return { data: (data ?? []) as AgendaEvento[] }
  } catch {
    return { error: "No autorizado." }
  }
}

// ============================================================================
// Crear
// ============================================================================
export async function crearEvento(
  input: AgendaEventoInput,
): Promise<Result<AgendaEvento>> {
  try {
    const profile = await requireRole([...ROLES_AGENDA])
    const limpio = sanitizar(input)
    if (typeof limpio === "string") return { error: limpio }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("agenda_eventos")
      .insert({ ...limpio, creado_por: profile.id })
      .select(COLUMNS)
      .single()

    if (error) return { error: error.message }
    revalidatePath("/agenda")
    return { data: data as AgendaEvento }
  } catch {
    return { error: "No autorizado." }
  }
}

// ============================================================================
// Actualizar
// ============================================================================
export async function actualizarEvento(
  id: string,
  input: AgendaEventoInput,
): Promise<Result<AgendaEvento>> {
  try {
    await requireRole([...ROLES_AGENDA])
    if (!id) return { error: "Falta el identificador del evento." }
    const limpio = sanitizar(input)
    if (typeof limpio === "string") return { error: limpio }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("agenda_eventos")
      .update({ ...limpio, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single()

    if (error) return { error: error.message }
    revalidatePath("/agenda")
    return { data: data as AgendaEvento }
  } catch {
    return { error: "No autorizado." }
  }
}

// ============================================================================
// Eliminar
// ============================================================================
export async function eliminarEvento(id: string): Promise<Ok> {
  try {
    await requireRole([...ROLES_AGENDA])
    if (!id) return { error: "Falta el identificador del evento." }

    const supabase = await createClient()
    const { error } = await supabase.from("agenda_eventos").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath("/agenda")
    return { success: true }
  } catch {
    return { error: "No autorizado." }
  }
}

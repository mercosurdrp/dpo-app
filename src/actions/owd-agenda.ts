"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import type { AgendaOwd, AgendaOwdInput, AgendaEstado } from "@/lib/owd-agenda"
import { AGENDA_ESTADOS } from "@/lib/owd-agenda"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

const ROLES = ["admin", "supervisor"] as const
const COLUMNS =
  "id, template_id, fecha, supervisor, empleado_observado, nota, estado, observacion_id, created_at, updated_at"

function sanitizar(input: AgendaOwdInput): AgendaOwdInput | string {
  if (!input.template_id) return "Elegí qué OWD vas a agendar."
  if (!input.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha))
    return "La fecha no es válida."
  const estado: AgendaEstado = AGENDA_ESTADOS.includes(input.estado as AgendaEstado)
    ? (input.estado as AgendaEstado)
    : "planificada"
  return {
    template_id: input.template_id,
    fecha: input.fecha,
    supervisor: input.supervisor?.trim() || null,
    empleado_observado: input.empleado_observado?.trim() || null,
    nota: input.nota?.trim() || null,
    estado,
  }
}

// Listado por rango (el calendario precarga el mes visible, lunes a domingo).
export async function listarAgendaEnRango(
  desde: string,
  hasta: string,
): Promise<Result<AgendaOwd[]>> {
  try {
    await requireRole([...ROLES])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_agenda")
      .select(COLUMNS)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data ?? []) as AgendaOwd[] }
  } catch {
    return { error: "No autorizado." }
  }
}

export async function crearAgenda(input: AgendaOwdInput): Promise<Result<AgendaOwd>> {
  try {
    const profile = await requireRole([...ROLES])
    const limpio = sanitizar(input)
    if (typeof limpio === "string") return { error: limpio }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_agenda")
      .insert({ ...limpio, created_by: profile.id })
      .select(COLUMNS)
      .single()
    if (error) return { error: error.message }
    revalidatePath("/owd/calendario")
    return { data: data as AgendaOwd }
  } catch {
    return { error: "No autorizado." }
  }
}

export async function actualizarAgenda(
  id: string,
  input: AgendaOwdInput,
): Promise<Result<AgendaOwd>> {
  try {
    await requireRole([...ROLES])
    if (!id) return { error: "Falta el identificador." }
    const limpio = sanitizar(input)
    if (typeof limpio === "string") return { error: limpio }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("owd_agenda")
      .update(limpio)
      .eq("id", id)
      .select(COLUMNS)
      .single()
    if (error) return { error: error.message }
    revalidatePath("/owd/calendario")
    return { data: data as AgendaOwd }
  } catch {
    return { error: "No autorizado." }
  }
}

export async function marcarEstadoAgenda(
  id: string,
  estado: AgendaEstado,
): Promise<Ok> {
  try {
    await requireRole([...ROLES])
    if (!id) return { error: "Falta el identificador." }
    if (!AGENDA_ESTADOS.includes(estado)) return { error: "Estado inválido." }
    const supabase = await createClient()
    const { error } = await supabase.from("owd_agenda").update({ estado }).eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/owd/calendario")
    return { success: true }
  } catch {
    return { error: "No autorizado." }
  }
}

export async function eliminarAgenda(id: string): Promise<Ok> {
  try {
    await requireRole([...ROLES])
    if (!id) return { error: "Falta el identificador." }
    const supabase = await createClient()
    const { error } = await supabase.from("owd_agenda").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/owd/calendario")
    return { success: true }
  } catch {
    return { error: "No autorizado." }
  }
}

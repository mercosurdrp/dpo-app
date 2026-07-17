"use server"

// Programación semanal de órdenes de trabajo (DPO Flota 2.2/2.4): lo que el
// Supervisor de Flota planea hacerle a cada unidad, con registro histórico y
// PDF imprimible para entregarle al taller/mecánico.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

export type OtProgramadaEstado =
  | "planificada"
  | "enviada"
  | "en_taller"
  | "realizada"
  | "cancelada"

export interface OtProgramada {
  id: string
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller: string
  notas: string
  estado: OtProgramadaEstado
  realizado_id: string | null
  created_at: string
  updated_at: string
}

type Result<T> = { data: T } | { error: string }

function normalizarTareas(tareas: string[]): string[] {
  return tareas.map((t) => t.trim()).filter(Boolean)
}

export async function getOtProgramadas(rango: {
  desde: string
  hasta: string
}): Promise<Result<OtProgramada[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .gte("fecha_programada", rango.desde)
      .lte("fecha_programada", rango.hasta)
      .order("fecha_programada")
      .order("dominio")
    if (error) return { error: error.message }
    return { data: (data || []) as OtProgramada[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createOtProgramada(input: {
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller?: string
  notas?: string
}): Promise<Result<OtProgramada>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const tareas = normalizarTareas(input.tareas)
    if (!input.dominio || !input.fecha_programada) {
      return { error: "Faltan unidad o fecha" }
    }
    if (tareas.length === 0) return { error: "Cargá al menos un trabajo a realizar" }
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .insert({
        dominio: input.dominio,
        fecha_programada: input.fecha_programada,
        tareas,
        taller: input.taller?.trim() ?? "",
        notas: input.notas?.trim() ?? "",
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateOtProgramada(input: {
  id: string
  fecha_programada?: string
  tareas?: string[]
  taller?: string
  notas?: string
  estado?: OtProgramadaEstado
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.fecha_programada) update.fecha_programada = input.fecha_programada
    if (input.tareas) {
      const tareas = normalizarTareas(input.tareas)
      if (tareas.length === 0) return { error: "Cargá al menos un trabajo a realizar" }
      update.tareas = tareas
    }
    if (input.taller !== undefined) update.taller = input.taller.trim()
    if (input.notas !== undefined) update.notas = input.notas.trim()
    if (input.estado) update.estado = input.estado
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .update(update)
      .eq("id", input.id)
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteOtProgramada(id: string): Promise<
  { success: true } | { error: string }
> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_ot_programadas")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

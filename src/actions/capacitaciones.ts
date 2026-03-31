"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  Capacitacion,
  CapacitacionFull,
  Empleado,
  Asistencia,
  AsistenciaConEmpleado,
  EstadoCapacitacion,
  ResultadoCapacitacion,
} from "@/types/database"

// ─── List capacitaciones ───
export async function getCapacitaciones(): Promise<
  { data: Capacitacion[] } | { error: string }
> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("capacitaciones")
      .select("*")
      .order("fecha", { ascending: false })

    if (error) return { error: error.message }
    return { data: data as Capacitacion[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading capacitaciones" }
  }
}

// ─── Get single capacitacion with asistencias ───
export async function getCapacitacion(
  id: string
): Promise<{ data: CapacitacionFull } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: cap, error: capError } = await supabase
      .from("capacitaciones")
      .select("*")
      .eq("id", id)
      .single()

    if (capError) return { error: capError.message }

    const { data: asistencias, error: asistError } = await supabase
      .from("asistencias")
      .select("*, empleado:empleados(*)")
      .eq("capacitacion_id", id)
      .order("created_at")

    if (asistError) return { error: asistError.message }

    return {
      data: {
        ...(cap as Capacitacion),
        asistencias: (asistencias ?? []) as AsistenciaConEmpleado[],
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading capacitacion" }
  }
}

// ─── Create capacitacion ───
export async function createCapacitacion(data: {
  titulo: string
  descripcion?: string
  instructor: string
  fecha: string
  duracion_horas: number
  lugar?: string
  material_url?: string
}): Promise<{ data: Capacitacion } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { data: cap, error } = await supabase
      .from("capacitaciones")
      .insert({
        titulo: data.titulo,
        descripcion: data.descripcion ?? null,
        instructor: data.instructor,
        fecha: data.fecha,
        duracion_horas: data.duracion_horas,
        lugar: data.lugar ?? null,
        material_url: data.material_url ?? null,
        estado: "programada",
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: cap as Capacitacion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating capacitacion" }
  }
}

// ─── Update capacitacion ───
export async function updateCapacitacion(
  id: string,
  data: {
    titulo?: string
    descripcion?: string
    instructor?: string
    fecha?: string
    duracion_horas?: number
    lugar?: string
    material_url?: string
    estado?: EstadoCapacitacion
  }
): Promise<{ data: Capacitacion } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { data: cap, error } = await supabase
      .from("capacitaciones")
      .update(data)
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: cap as Capacitacion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating capacitacion" }
  }
}

// ─── Delete capacitacion ───
export async function deleteCapacitacion(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    const { error } = await supabase.from("capacitaciones").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting capacitacion" }
  }
}

// ─── Get empleados ───
export async function getEmpleados(): Promise<
  { data: Empleado[] } | { error: string }
> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .eq("activo", true)
      .order("nombre")

    if (error) return { error: error.message }
    return { data: data as Empleado[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading empleados" }
  }
}

// ─── Add asistentes to capacitacion (bulk) ───
export async function addAsistentes(
  capacitacionId: string,
  empleadoIds: string[]
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const rows = empleadoIds.map((empleadoId) => ({
      capacitacion_id: capacitacionId,
      empleado_id: empleadoId,
      presente: false,
      resultado: "pendiente" as ResultadoCapacitacion,
    }))

    const { error } = await supabase.from("asistencias").upsert(rows, {
      onConflict: "capacitacion_id,empleado_id",
      ignoreDuplicates: true,
    })

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error adding asistentes" }
  }
}

// ─── Remove asistente ───
export async function removeAsistente(
  asistenciaId: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { error } = await supabase.from("asistencias").delete().eq("id", asistenciaId)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error removing asistente" }
  }
}

// ─── Update asistencia (attendance + grade) ───
export async function updateAsistencia(
  asistenciaId: string,
  data: {
    presente?: boolean
    nota?: number | null
    resultado?: ResultadoCapacitacion
    observaciones?: string | null
  }
): Promise<{ data: Asistencia } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { data: asistencia, error } = await supabase
      .from("asistencias")
      .update(data)
      .eq("id", asistenciaId)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: asistencia as Asistencia }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating asistencia" }
  }
}

// ─── Bulk update attendance (mark all present/absent) ───
export async function bulkUpdatePresencia(
  capacitacionId: string,
  empleadoPresencia: { asistenciaId: string; presente: boolean }[]
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    for (const item of empleadoPresencia) {
      const { error } = await supabase
        .from("asistencias")
        .update({ presente: item.presente })
        .eq("id", item.asistenciaId)

      if (error) return { error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating presencia" }
  }
}

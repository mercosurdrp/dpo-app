"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  Capacitacion,
  CapacitacionFull,
  CapacitacionPregunta,
  CapacitacionRespuesta,
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
  pilar?: string
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
        pilar: data.pilar ?? null,
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

// ═══════════════════════════════════════════
// EXAM (preguntas) management
// ═══════════════════════════════════════════

// ─── Get preguntas for a capacitacion ───
export async function getCapacitacionPreguntas(
  capacitacionId: string
): Promise<{ data: CapacitacionPregunta[] } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("capacitacion_preguntas")
      .select("*")
      .eq("capacitacion_id", capacitacionId)
      .order("orden")

    if (error) return { error: error.message }
    return { data: data as CapacitacionPregunta[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading preguntas" }
  }
}

// ─── Create pregunta ───
export async function createCapacitacionPregunta(data: {
  capacitacion_id: string
  texto: string
  opciones: string[]
  respuesta_correcta: number
  orden: number
}): Promise<{ data: CapacitacionPregunta } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { data: pregunta, error } = await supabase
      .from("capacitacion_preguntas")
      .insert({
        capacitacion_id: data.capacitacion_id,
        texto: data.texto,
        opciones: JSON.stringify(data.opciones),
        respuesta_correcta: data.respuesta_correcta,
        orden: data.orden,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: pregunta as CapacitacionPregunta }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating pregunta" }
  }
}

// ─── Update pregunta ───
export async function updateCapacitacionPregunta(
  id: string,
  data: {
    texto?: string
    opciones?: string[]
    respuesta_correcta?: number
    orden?: number
  }
): Promise<{ data: CapacitacionPregunta } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const updateData: Record<string, unknown> = {}
    if (data.texto !== undefined) updateData.texto = data.texto
    if (data.opciones !== undefined) updateData.opciones = JSON.stringify(data.opciones)
    if (data.respuesta_correcta !== undefined) updateData.respuesta_correcta = data.respuesta_correcta
    if (data.orden !== undefined) updateData.orden = data.orden

    const { data: pregunta, error } = await supabase
      .from("capacitacion_preguntas")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: pregunta as CapacitacionPregunta }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating pregunta" }
  }
}

// ─── Delete pregunta ───
export async function deleteCapacitacionPregunta(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { error } = await supabase
      .from("capacitacion_preguntas")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting pregunta" }
  }
}

// ═══════════════════════════════════════════
// EMPLOYEE exam taking
// ═══════════════════════════════════════════

// ─── Get capacitaciones for current empleado ───
export async function getMisCapacitaciones(): Promise<
  { data: (Capacitacion & { asistencia: Asistencia | null })[] } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Find the empleado linked to this profile
    const { data: empleado } = await supabase
      .from("empleados")
      .select("id")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { data: [] }

    // Get asistencias with capacitacion data
    const { data: asistencias, error } = await supabase
      .from("asistencias")
      .select("*, capacitacion:capacitaciones(*)")
      .eq("empleado_id", empleado.id)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    const result = (asistencias ?? []).map((a: Record<string, unknown>) => {
      const { capacitacion, ...asistencia } = a
      return {
        ...(capacitacion as Capacitacion),
        asistencia: asistencia as unknown as Asistencia,
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading capacitaciones" }
  }
}

// ─── Get my empleado record ───
export async function getMyEmpleado(): Promise<
  { data: Empleado | null } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .eq("profile_id", profile.id)
      .single()

    if (error && error.code !== "PGRST116") return { error: error.message }
    return { data: (data as Empleado) ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading empleado" }
  }
}

// ─── Submit exam answers ───
export async function submitExamen(
  capacitacionId: string,
  respuestas: { pregunta_id: string; respuesta_elegida: number }[]
): Promise<{ data: { nota: number; correctas: number; total: number } } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Find empleado
    const { data: empleado } = await supabase
      .from("empleados")
      .select("id")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { error: "No se encontro tu registro de empleado" }

    // Get correct answers
    const { data: preguntas, error: pregError } = await supabase
      .from("capacitacion_preguntas")
      .select("id, respuesta_correcta")
      .eq("capacitacion_id", capacitacionId)

    if (pregError) return { error: pregError.message }
    if (!preguntas || preguntas.length === 0) return { error: "No hay preguntas en este examen" }

    const correctaMap = new Map(
      preguntas.map((p: { id: string; respuesta_correcta: number }) => [p.id, p.respuesta_correcta])
    )

    // Build response rows
    let correctas = 0
    const rows = respuestas.map((r) => {
      const esCorrecta = correctaMap.get(r.pregunta_id) === r.respuesta_elegida
      if (esCorrecta) correctas++
      return {
        capacitacion_id: capacitacionId,
        empleado_id: empleado.id,
        pregunta_id: r.pregunta_id,
        respuesta_elegida: r.respuesta_elegida,
        es_correcta: esCorrecta,
      }
    })

    // Upsert responses
    const { error: respError } = await supabase
      .from("capacitacion_respuestas")
      .upsert(rows, {
        onConflict: "capacitacion_id,empleado_id,pregunta_id",
      })

    if (respError) return { error: respError.message }

    // Calculate nota
    const nota = Math.round((correctas / preguntas.length) * 100)
    const resultado = nota >= 60 ? "aprobado" : "desaprobado"

    // Update asistencia: mark present + set nota + resultado
    const { error: asistError } = await supabase
      .from("asistencias")
      .update({ presente: true, nota, resultado })
      .eq("capacitacion_id", capacitacionId)
      .eq("empleado_id", empleado.id)

    if (asistError) return { error: asistError.message }

    return { data: { nota, correctas, total: preguntas.length } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error submitting examen" }
  }
}

// ─── Get my answers for a capacitacion ───
export async function getMisRespuestas(
  capacitacionId: string
): Promise<{ data: CapacitacionRespuesta[] } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: empleado } = await supabase
      .from("empleados")
      .select("id")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { data: [] }

    const { data, error } = await supabase
      .from("capacitacion_respuestas")
      .select("*")
      .eq("capacitacion_id", capacitacionId)
      .eq("empleado_id", empleado.id)

    if (error) return { error: error.message }
    return { data: (data ?? []) as CapacitacionRespuesta[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading respuestas" }
  }
}

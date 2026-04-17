"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  Capacitacion,
  CapacitacionFull,
  CapacitacionPregunta,
  CapacitacionRespuesta,
  CapacitacionDpoPuntoFull,
  CapacitacionParaPregunta,
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

// ─── Update asistencia (attendance + observaciones)
// nota/resultado son inmutables: solo se setean al rendir el examen
export async function updateAsistencia(
  asistenciaId: string,
  data: {
    presente?: boolean
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

// ─── Toggle visible ───
export async function toggleCapacitacionVisible(
  id: string,
  visible: boolean
): Promise<{ data: Capacitacion } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    const { data: cap, error } = await supabase
      .from("capacitaciones")
      .update({ visible })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: cap as Capacitacion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error toggling visible" }
  }
}

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

    // Only show visible capacitaciones to employees
    const result = (asistencias ?? [])
      .map((a: Record<string, unknown>) => {
        const { capacitacion, ...asistencia } = a
        return {
          ...(capacitacion as Capacitacion),
          asistencia: asistencia as unknown as Asistencia,
        }
      })
      .filter((c) => c.visible)

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
): Promise<{ data: { nota: number; correctas: number; total: number; intento_n: number } } | { error: string }> {
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

    // Bloquear retake si ya aprobó
    const { data: asistenciaActual } = await supabase
      .from("asistencias")
      .select("resultado")
      .eq("capacitacion_id", capacitacionId)
      .eq("empleado_id", empleado.id)
      .maybeSingle()

    if (asistenciaActual?.resultado === "aprobado") {
      return { error: "Ya aprobaste este examen, no se puede volver a rendir" }
    }

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

    // Upsert responses (sobreescribe respuestas previas)
    const { error: respError } = await supabase
      .from("capacitacion_respuestas")
      .upsert(rows, {
        onConflict: "capacitacion_id,empleado_id,pregunta_id",
      })

    if (respError) return { error: respError.message }

    // Calculate nota
    const nota = Math.round((correctas / preguntas.length) * 100)
    const resultado = nota >= 80 ? "aprobado" : "desaprobado"

    // Calcular el número del nuevo intento
    const { data: ultimoIntento } = await supabase
      .from("examen_intentos")
      .select("intento_n")
      .eq("capacitacion_id", capacitacionId)
      .eq("empleado_id", empleado.id)
      .order("intento_n", { ascending: false })
      .limit(1)
      .maybeSingle()

    const intento_n = (ultimoIntento?.intento_n ?? 0) + 1

    // Insertar el intento en el historial
    const { error: intentoError } = await supabase
      .from("examen_intentos")
      .insert({
        capacitacion_id: capacitacionId,
        empleado_id: empleado.id,
        intento_n,
        nota,
        correctas,
        total: preguntas.length,
      })

    if (intentoError) return { error: intentoError.message }

    // Update asistencia: mark present + set nota + resultado
    const { error: asistError } = await supabase
      .from("asistencias")
      .update({ presente: true, nota, resultado })
      .eq("capacitacion_id", capacitacionId)
      .eq("empleado_id", empleado.id)

    if (asistError) return { error: asistError.message }

    return { data: { nota, correctas, total: preguntas.length, intento_n } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error submitting examen" }
  }
}

// ─── Listar intentos de un empleado en una capacitación ───
export async function getMisIntentos(
  capacitacionId: string
): Promise<{ data: { intento_n: number; nota: number; correctas: number | null; total: number | null; created_at: string }[] } | { error: string }> {
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
      .from("examen_intentos")
      .select("intento_n, nota, correctas, total, created_at")
      .eq("capacitacion_id", capacitacionId)
      .eq("empleado_id", empleado.id)
      .order("intento_n", { ascending: true })

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error obteniendo intentos" }
  }
}

// ─── Listar intentos de TODOS los empleados de una capacitación (admin) ───
export async function getIntentosCapacitacion(
  capacitacionId: string
): Promise<{ data: { empleado_id: string; intento_n: number; nota: number; correctas: number | null; total: number | null; created_at: string }[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("examen_intentos")
      .select("empleado_id, intento_n, nota, correctas, total, created_at")
      .eq("capacitacion_id", capacitacionId)
      .order("empleado_id", { ascending: true })
      .order("intento_n", { ascending: true })

    if (error) return { error: error.message }
    return { data: data ?? [] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error obteniendo intentos" }
  }
}

// ═══════════════════════════════════════════
// DPO PUNTOS LINKING
// ═══════════════════════════════════════════

// ─── Get DPO puntos linked to a capacitacion ───
export async function getDpoPuntosForCapacitacion(
  capacitacionId: string
): Promise<{ data: CapacitacionDpoPuntoFull[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: links, error } = await supabase
      .from("capacitacion_dpo_puntos")
      .select("*")
      .eq("capacitacion_id", capacitacionId)

    if (error) return { error: error.message }
    if (!links || links.length === 0) return { data: [] }

    // Get pregunta details with bloque and pilar info
    const preguntaIds = links.map((l: { pregunta_id: string }) => l.pregunta_id)

    const { data: preguntas, error: pregErr } = await supabase
      .from("preguntas")
      .select("id, numero, texto, bloque_id")
      .in("id", preguntaIds)

    if (pregErr) return { error: pregErr.message }

    const bloqueIds = [...new Set((preguntas ?? []).map((p: { bloque_id: string }) => p.bloque_id))]

    const { data: bloques } = await supabase
      .from("bloques")
      .select("id, nombre, pilar_id")
      .in("id", bloqueIds)

    const pilarIds = [...new Set((bloques ?? []).map((b: { pilar_id: string }) => b.pilar_id))]

    const { data: pilares } = await supabase
      .from("pilares")
      .select("id, nombre, color")
      .in("id", pilarIds)

    // Build maps
    const pilarMap = new Map((pilares ?? []).map((p: { id: string; nombre: string; color: string }) => [p.id, p]))
    const bloqueMap = new Map(
      (bloques ?? []).map((b: { id: string; nombre: string; pilar_id: string }) => [b.id, b])
    )
    const preguntaMap = new Map(
      (preguntas ?? []).map((p: { id: string; numero: string; texto: string; bloque_id: string }) => [p.id, p])
    )

    const result: CapacitacionDpoPuntoFull[] = links.map(
      (link: { id: string; capacitacion_id: string; pregunta_id: string; created_at: string }) => {
        const preg = preguntaMap.get(link.pregunta_id)
        const bloque = preg ? bloqueMap.get(preg.bloque_id) : null
        const pilar = bloque ? pilarMap.get(bloque.pilar_id) : null

        return {
          id: link.id,
          capacitacion_id: link.capacitacion_id,
          pregunta_id: link.pregunta_id,
          created_at: link.created_at,
          pregunta_numero: preg?.numero ?? "",
          pregunta_texto: preg?.texto ?? "",
          bloque_nombre: bloque?.nombre ?? "",
          pilar_id: pilar?.id ?? "",
          pilar_nombre: pilar?.nombre ?? "",
          pilar_color: pilar?.color ?? "#94A3B8",
        }
      }
    )

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading DPO puntos" }
  }
}

// ─── Save DPO puntos for a capacitacion (replace all) ───
export async function saveDpoPuntos(
  capacitacionId: string,
  preguntaIds: string[]
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "auditor"])
    const supabase = await createClient()

    // Delete existing
    const { error: delError } = await supabase
      .from("capacitacion_dpo_puntos")
      .delete()
      .eq("capacitacion_id", capacitacionId)

    if (delError) return { error: delError.message }

    // Insert new
    if (preguntaIds.length > 0) {
      const rows = preguntaIds.map((preguntaId) => ({
        capacitacion_id: capacitacionId,
        pregunta_id: preguntaId,
      }))

      const { error: insError } = await supabase
        .from("capacitacion_dpo_puntos")
        .insert(rows)

      if (insError) return { error: insError.message }
    }

    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error saving DPO puntos" }
  }
}

// ─── Get all pilares → bloques → preguntas hierarchy (for selector) ───
export async function getDpoHierarchy(): Promise<
  {
    data: {
      id: string
      nombre: string
      color: string
      bloques: {
        id: string
        nombre: string
        preguntas: { id: string; numero: string; texto: string }[]
      }[]
    }[]
  } | { error: string }
> {
  try {
    const supabase = await createClient()

    const [pilaresRes, bloquesRes, preguntasRes] = await Promise.all([
      supabase.from("pilares").select("id, nombre, color").order("orden"),
      supabase.from("bloques").select("id, nombre, pilar_id").order("orden"),
      supabase.from("preguntas").select("id, numero, texto, bloque_id").order("numero"),
    ])

    if (pilaresRes.error) return { error: pilaresRes.error.message }
    if (bloquesRes.error) return { error: bloquesRes.error.message }
    if (preguntasRes.error) return { error: preguntasRes.error.message }

    // Group preguntas by bloque
    const pregsByBloque = new Map<string, { id: string; numero: string; texto: string }[]>()
    for (const p of preguntasRes.data ?? []) {
      const list = pregsByBloque.get(p.bloque_id) ?? []
      list.push({ id: p.id, numero: p.numero, texto: p.texto })
      pregsByBloque.set(p.bloque_id, list)
    }

    // Group bloques by pilar
    const bloquesByPilar = new Map<
      string,
      { id: string; nombre: string; preguntas: { id: string; numero: string; texto: string }[] }[]
    >()
    for (const b of bloquesRes.data ?? []) {
      const list = bloquesByPilar.get(b.pilar_id) ?? []
      list.push({
        id: b.id,
        nombre: b.nombre,
        preguntas: pregsByBloque.get(b.id) ?? [],
      })
      bloquesByPilar.set(b.pilar_id, list)
    }

    const hierarchy = (pilaresRes.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      color: p.color,
      bloques: bloquesByPilar.get(p.id) ?? [],
    }))

    return { data: hierarchy }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading DPO hierarchy" }
  }
}

// ─── Get capacitaciones linked to a pregunta (for pregunta detail view) ───
export async function getCapacitacionesForPregunta(
  preguntaId: string
): Promise<{ data: CapacitacionParaPregunta[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get capacitacion IDs linked to this pregunta
    const { data: links, error: linkErr } = await supabase
      .from("capacitacion_dpo_puntos")
      .select("capacitacion_id")
      .eq("pregunta_id", preguntaId)

    if (linkErr) return { error: linkErr.message }
    if (!links || links.length === 0) return { data: [] }

    const capIds = links.map((l: { capacitacion_id: string }) => l.capacitacion_id)

    // Get capacitaciones
    const { data: caps, error: capErr } = await supabase
      .from("capacitaciones")
      .select("id, titulo, instructor, fecha, estado, duracion_horas")
      .in("id", capIds)
      .order("fecha", { ascending: false })

    if (capErr) return { error: capErr.message }

    // Get asistencia stats for each
    const { data: asistencias } = await supabase
      .from("asistencias")
      .select("capacitacion_id, presente, resultado")
      .in("capacitacion_id", capIds)

    // Aggregate stats
    const statsMap = new Map<string, { total: number; presentes: number; aprobados: number }>()
    for (const a of asistencias ?? []) {
      const key = a.capacitacion_id as string
      const s = statsMap.get(key) ?? { total: 0, presentes: 0, aprobados: 0 }
      s.total++
      if (a.presente) s.presentes++
      if (a.resultado === "aprobado") s.aprobados++
      statsMap.set(key, s)
    }

    const result: CapacitacionParaPregunta[] = (caps ?? []).map(
      (c: { id: string; titulo: string; instructor: string; fecha: string; estado: EstadoCapacitacion; duracion_horas: number }) => {
        const s = statsMap.get(c.id) ?? { total: 0, presentes: 0, aprobados: 0 }
        return {
          id: c.id,
          titulo: c.titulo,
          instructor: c.instructor,
          fecha: c.fecha,
          estado: c.estado,
          duracion_horas: c.duracion_horas,
          total_asistentes: s.total,
          presentes: s.presentes,
          aprobados: s.aprobados,
        }
      }
    )

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading capacitaciones for pregunta" }
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

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"
import type {
  PlanAccion,
  PlanAccionFull,
  PlanAccionListItem,
  PlanComentario,
  PlanComentarioConAutor,
  PlanHistorialConAutor,
  Evidencia,
  EstadoPlan,
  DpoArchivo,
} from "@/types/database"

// ---------- getPlanDetail ----------

export async function getPlanDetail(
  planId: string
): Promise<{ data: PlanAccionFull } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get plan
    const { data: plan, error: planErr } = await supabase
      .from("planes_accion")
      .select("*")
      .eq("id", planId)
      .single()

    if (planErr || !plan) {
      return { error: planErr?.message ?? "Plan no encontrado" }
    }

    // Get pregunta + bloque + pilar info
    const { data: pregunta } = await supabase
      .from("preguntas")
      .select("numero, texto, bloque_id")
      .eq("id", plan.pregunta_id)
      .single()

    let bloque_nombre = ""
    let pilar_id = ""
    let pilar_nombre = ""
    let pilar_color = ""

    if (pregunta) {
      const { data: bloque } = await supabase
        .from("bloques")
        .select("nombre, pilar_id")
        .eq("id", pregunta.bloque_id)
        .single()

      if (bloque) {
        bloque_nombre = bloque.nombre
        pilar_id = bloque.pilar_id

        const { data: pilar } = await supabase
          .from("pilares")
          .select("nombre, color")
          .eq("id", bloque.pilar_id)
          .single()

        if (pilar) {
          pilar_nombre = pilar.nombre
          pilar_color = pilar.color
        }
      }
    }

    // Get comentarios with author names
    const { data: comentariosRaw } = await supabase
      .from("plan_comentarios")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })

    const comentarios: PlanComentarioConAutor[] = []
    for (const c of (comentariosRaw ?? []) as PlanComentario[]) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("id", c.created_by)
        .single()

      comentarios.push({
        ...c,
        autor_nombre: profile?.nombre ?? "Usuario",
      })
    }

    // Get historial with author names
    const { data: historialRaw } = await supabase
      .from("plan_historial")
      .select("*")
      .eq("plan_id", planId)
      .order("changed_at", { ascending: false })

    const historial: PlanHistorialConAutor[] = []
    for (const h of historialRaw ?? []) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("id", h.changed_by)
        .single()

      historial.push({
        ...(h as PlanHistorialConAutor),
        autor_nombre: profile?.nombre ?? "Usuario",
      })
    }

    // Get linked evidencias via junction table
    const { data: links } = await supabase
      .from("evidencia_planes")
      .select("evidencia_id")
      .eq("plan_id", planId)

    const evidenciaIds = (links ?? []).map((l: { evidencia_id: string }) => l.evidencia_id)
    let evidencias: Evidencia[] = []

    if (evidenciaIds.length > 0) {
      const { data: evData } = await supabase
        .from("evidencias")
        .select("*")
        .in("id", evidenciaIds)
        .order("created_at", { ascending: false })

      evidencias = (evData ?? []) as Evidencia[]
    }

    // Get linked dpo_archivos via dpo_archivo_planes junction
    const { data: archivosLinks } = await supabase
      .from("dpo_archivo_planes")
      .select("archivo_id")
      .eq("plan_id", planId)

    const archivoIds = (archivosLinks ?? []).map((l: { archivo_id: string }) => l.archivo_id)
    let archivos_dpo: DpoArchivo[] = []

    if (archivoIds.length > 0) {
      const { data: archivosData } = await supabase
        .from("dpo_archivos")
        .select("*")
        .in("id", archivoIds)
        .eq("archivado", false)
        .order("created_at", { ascending: false })

      archivos_dpo = (archivosData ?? []) as DpoArchivo[]
    }

    const result: PlanAccionFull = {
      ...(plan as PlanAccion),
      pregunta_numero: pregunta?.numero ?? "",
      pregunta_texto: pregunta?.texto ?? "",
      bloque_nombre,
      pilar_id,
      pilar_nombre,
      pilar_color,
      comentarios,
      historial,
      evidencias,
      archivos_dpo,
    }

    return { data: result }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading plan detail",
    }
  }
}

// ---------- getPlanesList ----------

export async function getPlanesList(): Promise<
  { data: PlanAccionListItem[] } | { error: string }
> {
  try {
    const supabase = await createClient()

    const { data: planes, error } = await supabase
      .from("planes_accion")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    const items: PlanAccionListItem[] = []

    for (const plan of (planes ?? []) as PlanAccion[]) {
      // Get pregunta info
      const { data: pregunta } = await supabase
        .from("preguntas")
        .select("numero, texto, bloque_id")
        .eq("id", plan.pregunta_id)
        .single()

      let pilar_nombre = ""
      let pilar_color = ""

      if (pregunta) {
        const { data: bloque } = await supabase
          .from("bloques")
          .select("pilar_id")
          .eq("id", pregunta.bloque_id)
          .single()

        if (bloque) {
          const { data: pilar } = await supabase
            .from("pilares")
            .select("nombre, color")
            .eq("id", bloque.pilar_id)
            .single()

          if (pilar) {
            pilar_nombre = pilar.nombre
            pilar_color = pilar.color
          }
        }
      }

      // Count comentarios
      const { count: comentariosCount } = await supabase
        .from("plan_comentarios")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)

      // Count evidencias
      const { count: evidenciasCount } = await supabase
        .from("evidencia_planes")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)

      items.push({
        ...plan,
        pregunta_numero: pregunta?.numero ?? "",
        pregunta_texto: pregunta?.texto ?? "",
        pilar_nombre,
        pilar_color,
        comentarios_count: comentariosCount ?? 0,
        evidencias_count: evidenciasCount ?? 0,
      })
    }

    return { data: items }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading planes list",
    }
  }
}

// ---------- updatePlanEstado (with history) ----------

export async function updatePlanEstado(
  planId: string,
  nuevoEstado: EstadoPlan
): Promise<{ data: PlanAccion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Get current estado
    const { data: current, error: getErr } = await supabase
      .from("planes_accion")
      .select("estado")
      .eq("id", planId)
      .single()

    if (getErr || !current) {
      return { error: getErr?.message ?? "Plan no encontrado" }
    }

    const estadoAnterior = current.estado as EstadoPlan

    if (estadoAnterior === nuevoEstado) {
      // No change needed
      const { data: plan } = await supabase
        .from("planes_accion")
        .select("*")
        .eq("id", planId)
        .single()
      return { data: plan as PlanAccion }
    }

    // Update estado
    const { data: plan, error: updateErr } = await supabase
      .from("planes_accion")
      .update({ estado: nuevoEstado })
      .eq("id", planId)
      .select()
      .single()

    if (updateErr) return { error: updateErr.message }

    // Insert history entry
    await supabase.from("plan_historial").insert({
      plan_id: planId,
      estado_anterior: estadoAnterior,
      estado_nuevo: nuevoEstado,
      changed_by: profile.id,
    })

    return { data: plan as PlanAccion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating estado" }
  }
}

// ---------- updatePlanProgreso ----------

export async function updatePlanProgreso(
  planId: string,
  progreso: number
): Promise<{ data: PlanAccion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const clamped = Math.min(100, Math.max(0, progreso))
    const { data: plan, error } = await supabase
      .from("planes_accion")
      .update({ progreso: clamped })
      .eq("id", planId)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: plan as PlanAccion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating progreso" }
  }
}

// ---------- updatePlanNotas ----------

export async function updatePlanNotas(
  planId: string,
  notas: string
): Promise<{ data: PlanAccion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: plan, error } = await supabase
      .from("planes_accion")
      .update({ notas: notas || null })
      .eq("id", planId)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: plan as PlanAccion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating notas" }
  }
}

// ---------- Comentarios ----------

export async function createPlanComentario(data: {
  plan_id: string
  texto: string
  foto_url?: string
}): Promise<{ data: PlanComentarioConAutor } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: comentario, error } = await supabase
      .from("plan_comentarios")
      .insert({
        plan_id: data.plan_id,
        texto: data.texto,
        foto_url: data.foto_url ?? null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    return {
      data: {
        ...(comentario as PlanComentario),
        autor_nombre: profile.nombre,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating comentario" }
  }
}

export async function deletePlanComentario(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("plan_comentarios").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting comentario" }
  }
}

// ---------- Evidencia linking ----------

export async function linkEvidenciaToPlan(
  evidenciaId: string,
  planId: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("evidencia_planes")
      .insert({ evidencia_id: evidenciaId, plan_id: planId })

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error linking evidencia" }
  }
}

export async function unlinkEvidenciaFromPlan(
  evidenciaId: string,
  planId: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("evidencia_planes")
      .delete()
      .eq("evidencia_id", evidenciaId)
      .eq("plan_id", planId)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error unlinking evidencia" }
  }
}

// ---------- Get unlinked evidencias for a plan ----------

export async function getUnlinkedEvidencias(
  planId: string,
  preguntaId: string
): Promise<{ data: Evidencia[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get already linked evidencia IDs
    const { data: links } = await supabase
      .from("evidencia_planes")
      .select("evidencia_id")
      .eq("plan_id", planId)

    const linkedIds = (links ?? []).map((l: { evidencia_id: string }) => l.evidencia_id)

    // Get all evidencias for the pregunta
    const { data: allEvidencias, error } = await supabase
      .from("evidencias")
      .select("*")
      .eq("pregunta_id", preguntaId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    // Filter out already linked
    const unlinked = (allEvidencias ?? []).filter(
      (e: Evidencia) => !linkedIds.includes(e.id)
    )

    return { data: unlinked as Evidencia[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading evidencias" }
  }
}

// ---------- DPO archivos linking ----------

export async function linkArchivoToPlan(
  planId: string,
  archivoId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("dpo_archivo_planes")
      .insert({ plan_id: planId, archivo_id: archivoId, created_by: profile.id })

    if (error) {
      // Si ya existe, lo tratamos como éxito (idempotente)
      if (error.code === "23505") return { success: true }
      return { error: error.message }
    }

    revalidatePath(`/planes/${planId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error vinculando archivo" }
  }
}

export async function unlinkArchivoFromPlan(
  planId: string,
  archivoId: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("dpo_archivo_planes")
      .delete()
      .eq("plan_id", planId)
      .eq("archivo_id", archivoId)

    if (error) return { error: error.message }

    revalidatePath(`/planes/${planId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desvinculando archivo" }
  }
}

export async function searchArchivos(
  query: string,
  planId?: string
): Promise<{ data: DpoArchivo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Excluir los ya vinculados al plan (si se pasa planId)
    let excluidos: string[] = []
    if (planId) {
      const { data: links } = await supabase
        .from("dpo_archivo_planes")
        .select("archivo_id")
        .eq("plan_id", planId)
      excluidos = (links ?? []).map((l: { archivo_id: string }) => l.archivo_id)
    }

    let q = supabase
      .from("dpo_archivos")
      .select("*")
      .eq("archivado", false)
      .order("created_at", { ascending: false })
      .limit(50)

    if (query.trim()) {
      q = q.or(`titulo.ilike.%${query}%,file_name.ilike.%${query}%,categoria.ilike.%${query}%`)
    }

    const { data, error } = await q

    if (error) return { error: error.message }

    const filtered = (data ?? []).filter((a: DpoArchivo) => !excluidos.includes(a.id))
    return { data: filtered as DpoArchivo[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error buscando archivos" }
  }
}

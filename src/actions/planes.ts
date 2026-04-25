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
  PlanResponsable,
  PlanResponsableConProfile,
  PlanResponsableRol,
  PlanReprogramacion,
  PlanReprogramacionConAutor,
  MisTareasItem,
  UserRole,
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

    // Get responsables (con profile data)
    const responsables = await getResponsablesPlan(planId)

    // Get reprogramaciones (con autor)
    const reprogramaciones = await getReprogramacionesPlan(planId)

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
      responsables,
      reprogramaciones,
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

// ---------- Responsables (multi-asignación tipo Teams) ----------

/**
 * Listar responsables de un plan, con info del profile.
 * Ordena: rol principal primero, luego por asignado_at.
 */
export async function getResponsablesPlan(
  planId: string
): Promise<PlanResponsableConProfile[]> {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from("plan_responsables")
    .select("*")
    .eq("plan_id", planId)
    .order("asignado_at", { ascending: true })

  const responsables = (rows ?? []) as PlanResponsable[]
  if (responsables.length === 0) return []

  const profileIds = Array.from(new Set(responsables.map((r) => r.profile_id)))

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nombre, email, role")
    .in("id", profileIds)

  const profileMap = new Map<
    string,
    { nombre: string; email: string | null; role: UserRole }
  >()
  for (const p of (profiles ?? []) as Array<{
    id: string
    nombre: string
    email: string | null
    role: UserRole
  }>) {
    profileMap.set(p.id, { nombre: p.nombre, email: p.email, role: p.role })
  }

  const enriched: PlanResponsableConProfile[] = responsables.map((r) => {
    const p = profileMap.get(r.profile_id)
    return {
      ...r,
      profile_nombre: p?.nombre ?? "Usuario",
      profile_email: p?.email ?? null,
      profile_role: (p?.role ?? "viewer") as UserRole,
    }
  })

  // Ordenar: principal primero, luego por asignado_at asc
  enriched.sort((a, b) => {
    if (a.rol === "responsable_principal" && b.rol !== "responsable_principal") return -1
    if (a.rol !== "responsable_principal" && b.rol === "responsable_principal") return 1
    return a.asignado_at.localeCompare(b.asignado_at)
  })

  return enriched
}

/**
 * Agregar un responsable al plan.
 * Si rol="responsable_principal" y ya existe uno, falla con mensaje legible.
 */
export async function addResponsable(
  planId: string,
  profileId: string,
  rol: PlanResponsableRol = "coresponsable"
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("plan_responsables").insert({
      plan_id: planId,
      profile_id: profileId,
      rol,
      asignado_por: profile.id,
    })

    if (error) {
      // Unique violation (PG 23505): plan+profile o partial unique de principal
      if (error.code === "23505") {
        if (rol === "responsable_principal") {
          return {
            ok: false,
            error: "Ya existe un responsable principal en este plan. Quitalo o cambialo de rol primero.",
          }
        }
        return {
          ok: false,
          error: "Esta persona ya está asignada al plan.",
        }
      }
      return { ok: false, error: error.message }
    }

    revalidatePath("/planes")
    revalidatePath(`/planes/${planId}`)
    revalidatePath("/mis-tareas")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error agregando responsable",
    }
  }
}

/**
 * Quitar un responsable del plan.
 */
export async function removeResponsable(
  planId: string,
  profileId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("plan_responsables")
      .delete()
      .eq("plan_id", planId)
      .eq("profile_id", profileId)

    if (error) return { ok: false, error: error.message }

    revalidatePath("/planes")
    revalidatePath(`/planes/${planId}`)
    revalidatePath("/mis-tareas")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error quitando responsable",
    }
  }
}

/**
 * Promover un responsable a "responsable_principal".
 * Por la unique partial index, hay que hacerlo en 2 pasos:
 *   1) Bajar al actual principal (si lo hay) a coresponsable
 *   2) Subir al objetivo a principal
 * Si el paso 2 falla, revertimos el paso 1.
 */
export async function setResponsablePrincipal(
  planId: string,
  profileId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Verificar que el target existe en el plan
    const { data: target, error: targetErr } = await supabase
      .from("plan_responsables")
      .select("*")
      .eq("plan_id", planId)
      .eq("profile_id", profileId)
      .maybeSingle()

    if (targetErr) return { ok: false, error: targetErr.message }
    if (!target) {
      return {
        ok: false,
        error: "Esa persona no es responsable del plan. Asignala primero.",
      }
    }

    if ((target as PlanResponsable).rol === "responsable_principal") {
      // Ya es principal, no-op
      return { ok: true }
    }

    // Buscar el principal actual (si existe)
    const { data: currentPrincipal } = await supabase
      .from("plan_responsables")
      .select("*")
      .eq("plan_id", planId)
      .eq("rol", "responsable_principal")
      .maybeSingle()

    const previousPrincipal = currentPrincipal as PlanResponsable | null

    // Paso 1: bajar al actual principal a coresponsable (si lo hay)
    if (previousPrincipal) {
      const { error: demoteErr } = await supabase
        .from("plan_responsables")
        .update({ rol: "coresponsable" })
        .eq("id", previousPrincipal.id)

      if (demoteErr) {
        return {
          ok: false,
          error: `No se pudo bajar al responsable principal actual: ${demoteErr.message}`,
        }
      }
    }

    // Paso 2: subir al target a principal
    const { error: promoteErr } = await supabase
      .from("plan_responsables")
      .update({ rol: "responsable_principal" })
      .eq("id", (target as PlanResponsable).id)

    if (promoteErr) {
      // Revertir paso 1
      if (previousPrincipal) {
        await supabase
          .from("plan_responsables")
          .update({ rol: "responsable_principal" })
          .eq("id", previousPrincipal.id)
      }
      return {
        ok: false,
        error: `No se pudo promover a principal: ${promoteErr.message}`,
      }
    }

    revalidatePath("/planes")
    revalidatePath(`/planes/${planId}`)
    revalidatePath("/mis-tareas")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error cambiando responsable principal",
    }
  }
}

/**
 * Buscar profiles para el multi-picker de responsables.
 * Solo activos y con role admin/auditor. Limit 20.
 */
export async function searchProfilesParaResponsable(
  query: string
): Promise<{ id: string; nombre: string; email: string; role: UserRole }[]> {
  const supabase = await createClient()

  let q = supabase
    .from("profiles")
    .select("id, nombre, email, role")
    .eq("active", true)
    .in("role", ["admin", "auditor"])
    .order("nombre", { ascending: true })
    .limit(20)

  const trimmed = query.trim()
  if (trimmed) {
    const safe = trimmed.replace(/[%_]/g, (c) => `\\${c}`)
    q = q.or(`nombre.ilike.%${safe}%,email.ilike.%${safe}%`)
  }

  const { data, error } = await q
  if (error || !data) return []

  return (data as Array<{ id: string; nombre: string; email: string; role: UserRole }>).map(
    (p) => ({
      id: p.id,
      nombre: p.nombre,
      email: p.email,
      role: p.role,
    })
  )
}

// ---------- Mis tareas ----------

/**
 * Lista consolidada de tareas asignadas al usuario logueado.
 * Incluye datos de pregunta/pilar, flags de vencimiento, y count de evidencias.
 */
export async function getMisTareas(): Promise<MisTareasItem[]> {
  const profile = await requireAuth()
  const supabase = await createClient()

  // 1) Obtener todos los plan_responsables del user
  const { data: rels } = await supabase
    .from("plan_responsables")
    .select("plan_id, rol")
    .eq("profile_id", profile.id)

  const relaciones = (rels ?? []) as Array<{ plan_id: string; rol: PlanResponsableRol }>
  if (relaciones.length === 0) return []

  const planIds = relaciones.map((r) => r.plan_id)
  const rolMap = new Map<string, PlanResponsableRol>()
  for (const r of relaciones) rolMap.set(r.plan_id, r.rol)

  // 2) Obtener planes
  const { data: planesRaw } = await supabase
    .from("planes_accion")
    .select("*")
    .in("id", planIds)

  const planes = (planesRaw ?? []) as PlanAccion[]
  if (planes.length === 0) return []

  // 3) Preguntas
  const preguntaIds = Array.from(new Set(planes.map((p) => p.pregunta_id)))
  const { data: preguntasRaw } = await supabase
    .from("preguntas")
    .select("id, numero, texto, bloque_id")
    .in("id", preguntaIds)

  const preguntas = (preguntasRaw ?? []) as Array<{
    id: string
    numero: string
    texto: string
    bloque_id: string
  }>
  const preguntaMap = new Map(preguntas.map((p) => [p.id, p]))

  // 4) Bloques → pilar
  const bloqueIds = Array.from(new Set(preguntas.map((p) => p.bloque_id)))
  const { data: bloquesRaw } = await supabase
    .from("bloques")
    .select("id, pilar_id")
    .in("id", bloqueIds)

  const bloques = (bloquesRaw ?? []) as Array<{ id: string; pilar_id: string }>
  const bloqueMap = new Map(bloques.map((b) => [b.id, b]))

  // 5) Pilares
  const pilarIds = Array.from(new Set(bloques.map((b) => b.pilar_id)))
  const { data: pilaresRaw } = await supabase
    .from("pilares")
    .select("id, nombre, color")
    .in("id", pilarIds)

  const pilares = (pilaresRaw ?? []) as Array<{
    id: string
    nombre: string
    color: string
  }>
  const pilarMap = new Map(pilares.map((p) => [p.id, p]))

  // 6) Counts de evidencias (evidencia_planes + dpo_archivo_planes)
  const { data: evLinks } = await supabase
    .from("evidencia_planes")
    .select("plan_id")
    .in("plan_id", planIds)

  const { data: archLinks } = await supabase
    .from("dpo_archivo_planes")
    .select("plan_id")
    .in("plan_id", planIds)

  const evCount = new Map<string, number>()
  for (const r of (evLinks ?? []) as Array<{ plan_id: string }>) {
    evCount.set(r.plan_id, (evCount.get(r.plan_id) ?? 0) + 1)
  }
  for (const r of (archLinks ?? []) as Array<{ plan_id: string }>) {
    evCount.set(r.plan_id, (evCount.get(r.plan_id) ?? 0) + 1)
  }

  // 7) Construir items
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const items: MisTareasItem[] = planes.map((plan) => {
    const pregunta = preguntaMap.get(plan.pregunta_id)
    const bloque = pregunta ? bloqueMap.get(pregunta.bloque_id) : undefined
    const pilar = bloque ? pilarMap.get(bloque.pilar_id) : undefined

    let is_overdue = false
    let dias_para_vencer: number | null = null
    if (plan.fecha_limite) {
      const limite = new Date(plan.fecha_limite + "T00:00:00")
      const diffMs = limite.getTime() - today.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      dias_para_vencer = diffDays
      if (diffDays < 0 && plan.estado !== "completado") {
        is_overdue = true
      }
    }

    return {
      ...plan,
      pregunta_numero: pregunta?.numero ?? "",
      pregunta_texto: pregunta?.texto ?? "",
      pilar_nombre: pilar?.nombre ?? "",
      pilar_color: pilar?.color ?? "",
      rol_usuario: rolMap.get(plan.id) ?? "coresponsable",
      is_overdue,
      dias_para_vencer,
      evidencias_count: evCount.get(plan.id) ?? 0,
    }
  })

  // 8) Ordenar:
  //    - completados al final
  //    - resto: fecha_limite ASC NULLS LAST
  //    - tiebreaker: prioridad alta primero
  const prioridadOrden: Record<string, number> = { alta: 0, media: 1, baja: 2 }

  items.sort((a, b) => {
    const aDone = a.estado === "completado"
    const bDone = b.estado === "completado"
    if (aDone !== bDone) return aDone ? 1 : -1

    // fecha_limite ASC NULLS LAST
    if (a.fecha_limite && !b.fecha_limite) return -1
    if (!a.fecha_limite && b.fecha_limite) return 1
    if (a.fecha_limite && b.fecha_limite) {
      const cmp = a.fecha_limite.localeCompare(b.fecha_limite)
      if (cmp !== 0) return cmp
    }

    // tiebreaker prioridad
    return (prioridadOrden[a.prioridad] ?? 99) - (prioridadOrden[b.prioridad] ?? 99)
  })

  return items
}

// ---------- Reprogramaciones ----------

/**
 * Reprogramar un plan: registra reprogramación + actualiza fecha_limite.
 * Si el plan estaba completado, vuelve a en_progreso.
 */
export async function reprogramarPlan(
  planId: string,
  fechaNueva: string,
  motivo: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Permiso: admin/auditor o responsable
    let permitido = profile.role === "admin" || profile.role === "auditor"
    if (!permitido) {
      const { data: rel } = await supabase
        .from("plan_responsables")
        .select("id")
        .eq("plan_id", planId)
        .eq("profile_id", profile.id)
        .maybeSingle()
      permitido = !!rel
    }
    if (!permitido) {
      return { ok: false, error: "No tenés permiso para reprogramar este plan." }
    }

    // 1) leer plan actual
    const { data: planActual, error: getErr } = await supabase
      .from("planes_accion")
      .select("fecha_limite, estado")
      .eq("id", planId)
      .single()

    if (getErr || !planActual) {
      return { ok: false, error: getErr?.message ?? "Plan no encontrado" }
    }

    const fechaAnterior = (planActual as { fecha_limite: string | null }).fecha_limite
    const estadoAnterior = (planActual as { estado: EstadoPlan }).estado

    // 2) INSERT reprogramación
    const { error: insErr } = await supabase.from("plan_reprogramaciones").insert({
      plan_id: planId,
      fecha_anterior: fechaAnterior,
      fecha_nueva: fechaNueva,
      motivo: motivo && motivo.trim() ? motivo.trim() : null,
      reprogramado_por: profile.id,
    })

    if (insErr) return { ok: false, error: insErr.message }

    // 3) UPDATE plan: fecha_limite + estado si estaba completado
    const updates: { fecha_limite: string; estado?: EstadoPlan } = {
      fecha_limite: fechaNueva,
    }
    let estadoCambio = false
    if (estadoAnterior === "completado") {
      updates.estado = "en_progreso"
      estadoCambio = true
    }

    const { error: updErr } = await supabase
      .from("planes_accion")
      .update(updates)
      .eq("id", planId)

    if (updErr) return { ok: false, error: updErr.message }

    // 4) historial si cambió estado
    if (estadoCambio) {
      await supabase.from("plan_historial").insert({
        plan_id: planId,
        estado_anterior: estadoAnterior,
        estado_nuevo: "en_progreso",
        changed_by: profile.id,
      })
    }

    revalidatePath("/planes")
    revalidatePath(`/planes/${planId}`)
    revalidatePath("/mis-tareas")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error reprogramando plan",
    }
  }
}

/**
 * Lista las reprogramaciones de un plan, con nombre del autor.
 */
export async function getReprogramacionesPlan(
  planId: string
): Promise<PlanReprogramacionConAutor[]> {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from("plan_reprogramaciones")
    .select("*")
    .eq("plan_id", planId)
    .order("reprogramado_at", { ascending: false })

  const reprogramaciones = (rows ?? []) as PlanReprogramacion[]
  if (reprogramaciones.length === 0) return []

  const autorIds = Array.from(new Set(reprogramaciones.map((r) => r.reprogramado_por)))
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, nombre")
    .in("id", autorIds)

  const profileMap = new Map<string, string>()
  for (const p of (profiles ?? []) as Array<{ id: string; nombre: string }>) {
    profileMap.set(p.id, p.nombre)
  }

  return reprogramaciones.map((r) => ({
    ...r,
    autor_nombre: profileMap.get(r.reprogramado_por) ?? "Usuario",
  }))
}

// ---------- Cerrar plan ----------

/**
 * Cierra un plan (estado=completado, progreso=100).
 * Si el plan tiene evidencia_obligatoria=true, requiere al menos 1 evidencia
 * (vía evidencia_planes o dpo_archivo_planes) o cierre forzado por admin con motivo.
 */
export async function cerrarPlan(
  planId: string,
  opts: { sinEvidencia?: boolean; motivoSinEvidencia?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // 1) leer plan
    const { data: planRow, error: getErr } = await supabase
      .from("planes_accion")
      .select("estado, evidencia_obligatoria")
      .eq("id", planId)
      .single()

    if (getErr || !planRow) {
      return { ok: false, error: getErr?.message ?? "Plan no encontrado" }
    }

    const plan = planRow as { estado: EstadoPlan; evidencia_obligatoria: boolean }

    // contar evidencias vinculadas (ambas tablas)
    const [{ count: evCount }, { count: archCount }] = await Promise.all([
      supabase
        .from("evidencia_planes")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId),
      supabase
        .from("dpo_archivo_planes")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId),
    ])

    const totalEvidencias = (evCount ?? 0) + (archCount ?? 0)

    // 2) validaciones de evidencia
    const updates: {
      estado: EstadoPlan
      progreso: number
      cerrado_sin_evidencia_motivo?: string | null
    } = {
      estado: "completado",
      progreso: 100,
    }

    if (plan.evidencia_obligatoria) {
      if (totalEvidencias === 0 && opts.sinEvidencia !== true) {
        return {
          ok: false,
          error: "Este plan requiere evidencia para cerrar. Adjuntá al menos una o forzá el cierre con motivo.",
        }
      }

      if (opts.sinEvidencia === true) {
        const motivo = (opts.motivoSinEvidencia ?? "").trim()
        if (!motivo) {
          return {
            ok: false,
            error: "Debés indicar un motivo para cerrar sin evidencia.",
          }
        }
        if (profile.role !== "admin") {
          return {
            ok: false,
            error: "Sólo un administrador puede cerrar un plan sin evidencia.",
          }
        }
        updates.cerrado_sin_evidencia_motivo = motivo
      }
    }

    // 3) UPDATE
    const { error: updErr } = await supabase
      .from("planes_accion")
      .update(updates)
      .eq("id", planId)

    if (updErr) return { ok: false, error: updErr.message }

    // 4) historial si cambió estado
    if (plan.estado !== "completado") {
      await supabase.from("plan_historial").insert({
        plan_id: planId,
        estado_anterior: plan.estado,
        estado_nuevo: "completado",
        changed_by: profile.id,
      })
    }

    revalidatePath("/planes")
    revalidatePath(`/planes/${planId}`)
    revalidatePath("/mis-tareas")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error cerrando plan",
    }
  }
}

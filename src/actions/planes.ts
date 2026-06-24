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
  PlanSeguimientoRef,
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

    // Get pregunta + bloque + pilar info (puede no existir si la tarea es directa sin punto asociado)
    const pregunta = plan.pregunta_id
      ? (
          await supabase
            .from("preguntas")
            .select("numero, texto, bloque_id")
            .eq("id", plan.pregunta_id)
            .single()
        ).data
      : null

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

    // Origen (si esta tarea es un seguimiento) y seguimientos generados
    const planRow = plan as PlanAccion
    let origen: PlanSeguimientoRef | null = null
    if (planRow.origen_plan_id) {
      const { data: orig } = await supabase
        .from("planes_accion")
        .select("id, titulo, descripcion")
        .eq("id", planRow.origen_plan_id)
        .maybeSingle()
      if (orig) {
        const o = orig as {
          id: string
          titulo: string | null
          descripcion: string
        }
        origen = { id: o.id, titulo: o.titulo || o.descripcion }
      }
    }

    const { data: segData } = await supabase
      .from("planes_accion")
      .select("id, titulo, descripcion")
      .eq("origen_plan_id", planId)
      .order("created_at", { ascending: false })
    const seguimientos: PlanSeguimientoRef[] = (
      (segData ?? []) as Array<{
        id: string
        titulo: string | null
        descripcion: string
      }>
    ).map((s) => ({ id: s.id, titulo: s.titulo || s.descripcion }))

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
      origen,
      seguimientos,
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

    // Sólo auditorías: las tareas directas (cargadas a operarios) viven en
    // "Mis Tareas", no en el listado de planes de acción.
    const { data: planes, error } = await supabase
      .from("planes_accion")
      .select("*")
      .neq("tipo", "directa")
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    // Cargar responsables resueltos (join plan_responsables → profiles)
    const planIdsAll = (planes ?? []).map((p) => (p as PlanAccion).id)
    type PRRow = {
      plan_id: string
      profile_id: string
      rol: PlanResponsableRol
      profile: { id: string; nombre: string; role: UserRole } | null
    }
    const { data: prRaw } = planIdsAll.length
      ? await supabase
          .from("plan_responsables")
          .select(
            "plan_id, profile_id, rol, profile:profiles!plan_responsables_profile_id_fkey(id, nombre, role)"
          )
          .in("plan_id", planIdsAll)
      : { data: [] as PRRow[] }
    // Para cada plan guardamos: responsable principal (si lo hay), el primer
    // responsable visto como fallback, y la cuenta de coresponsables. El
    // "representante" (principal, o el fallback) define si el plan es de un
    // administrador.
    type RepProfile = { nombre: string; role: UserRole }
    const prByPlan = new Map<
      string,
      { principal: RepProfile | null; fallback: RepProfile | null; coresponsables: number }
    >()
    for (const r of (prRaw ?? []) as unknown as PRRow[]) {
      const cur = prByPlan.get(r.plan_id) ?? {
        principal: null,
        fallback: null,
        coresponsables: 0,
      }
      const prof: RepProfile | null = r.profile
        ? { nombre: r.profile.nombre, role: r.profile.role }
        : null
      if (r.rol === "responsable_principal") {
        cur.principal = prof
      } else {
        cur.coresponsables += 1
      }
      if (!cur.fallback && prof) cur.fallback = prof
      prByPlan.set(r.plan_id, cur)
    }

    const items: PlanAccionListItem[] = []

    for (const plan of (planes ?? []) as PlanAccion[]) {
      const pr = prByPlan.get(plan.id)
      const rep = pr?.principal ?? pr?.fallback ?? null
      // Sólo planes de acción cuyo responsable es administrador.
      if (rep?.role !== "admin") continue

      // Get pregunta info (puede ser null si la tarea es directa sin punto)
      const pregunta = plan.pregunta_id
        ? (
            await supabase
              .from("preguntas")
              .select("numero, texto, bloque_id")
              .eq("id", plan.pregunta_id)
              .single()
          ).data
        : null

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
        responsable_principal_nombre: rep?.nombre ?? null,
        coresponsables_count: pr?.coresponsables ?? 0,
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
  preguntaId: string | null
): Promise<{ data: Evidencia[] } | { error: string }> {
  try {
    // Sin pregunta no se puede ofrecer "vincular existentes": el universo
    // es todas las evidencias de esa pregunta.
    if (!preguntaId) return { data: [] }

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
  // NO hacer early-return si el user no tiene planes de acción: la función
  // igual debe llegar al paso 8 para cargar las acciones 5S asignadas.
  // Con planIds vacío, los pasos 2-7 producen listas vacías sin error.

  const planIds = relaciones.map((r) => r.plan_id)
  const rolMap = new Map<string, PlanResponsableRol>()
  for (const r of relaciones) rolMap.set(r.plan_id, r.rol)

  // 2) Obtener planes
  const { data: planesRaw } = await supabase
    .from("planes_accion")
    .select("*")
    .in("id", planIds)

  const planes = (planesRaw ?? []) as PlanAccion[]
  // Sin early-return: ver nota arriba — el paso 8 (acciones 5S) debe correr
  // aunque el user no tenga ningún plan de acción.

  // 3) Preguntas (planes directos pueden no tener pregunta_id)
  const preguntaIds = Array.from(
    new Set(planes.map((p) => p.pregunta_id).filter((id): id is string => !!id))
  )
  const { data: preguntasRaw } = preguntaIds.length
    ? await supabase
        .from("preguntas")
        .select("id, numero, texto, bloque_id")
        .in("id", preguntaIds)
    : { data: [] as Array<{ id: string; numero: string; texto: string; bloque_id: string }> }

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

  const ESTADO_PLAN_TO_UNIFICADO: Record<
    string,
    "no_comenzada" | "en_curso" | "cerrada"
  > = {
    pendiente: "no_comenzada",
    en_progreso: "en_curso",
    completado: "cerrada",
  }

  const planItems = planes.map((plan) => {
    const pregunta = plan.pregunta_id ? preguntaMap.get(plan.pregunta_id) : undefined
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
      origen: "plan_accion" as const,
      pregunta_numero: pregunta?.numero ?? "",
      pregunta_texto: pregunta?.texto ?? "",
      pilar_nombre: pilar?.nombre ?? "",
      pilar_color: pilar?.color ?? "",
      rol_usuario: rolMap.get(plan.id) ?? "coresponsable",
      is_overdue,
      dias_para_vencer,
      evidencias_count: evCount.get(plan.id) ?? 0,
      estado_unificado: ESTADO_PLAN_TO_UNIFICADO[plan.estado] ?? "no_comenzada",
    }
  })

  // 8) Sumar acciones 5S asignadas al user
  const { data: s5Raw } = await supabase
    .from("s5_acciones")
    .select(
      `id, descripcion, fecha_compromiso, estado, tipo, sector_numero, vehiculo_id,
       vehiculo:catalogo_vehiculos!s5_acciones_vehiculo_id_fkey(id, dominio),
       evidencias:s5_acciones_evidencias(id)`
    )
    .eq("responsable_id", profile.id)

  // Cargar nombres de sectores de almacén (cacheado por la lista)
  const { data: sectoresRaw } = await supabase
    .from("s5_sectores_almacen")
    .select("numero, nombre")
  const sectorMap = new Map<number, string>()
  for (const s of (sectoresRaw ?? []) as Array<{ numero: number; nombre: string }>) {
    sectorMap.set(s.numero, s.nombre)
  }

  type S5Raw = {
    id: string
    descripcion: string
    fecha_compromiso: string | null
    estado: "no_comenzada" | "en_curso" | "cerrada"
    tipo: "flota" | "almacen"
    sector_numero: number | null
    vehiculo_id: string | null
    vehiculo: { id: string; dominio: string } | null
    evidencias: { id: string }[]
  }

  const s5Items = ((s5Raw ?? []) as unknown as S5Raw[]).map((s) => {
    let is_overdue = false
    let dias_para_vencer: number | null = null
    if (s.fecha_compromiso) {
      const limite = new Date(s.fecha_compromiso + "T00:00:00")
      const diffMs = limite.getTime() - today.getTime()
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
      dias_para_vencer = diffDays
      if (diffDays < 0 && s.estado !== "cerrada") {
        is_overdue = true
      }
    }

    return {
      origen: "s5_accion" as const,
      id: s.id,
      descripcion: s.descripcion,
      fecha_limite: s.fecha_compromiso,
      is_overdue,
      dias_para_vencer,
      evidencias_count: s.evidencias?.length ?? 0,
      estado_unificado: s.estado,
      s5_tipo: s.tipo,
      s5_sector_numero: s.sector_numero,
      s5_sector_nombre:
        s.sector_numero != null ? sectorMap.get(s.sector_numero) ?? null : null,
      s5_vehiculo_dominio: s.vehiculo?.dominio ?? null,
    }
  })

  const items: MisTareasItem[] = [...planItems, ...s5Items] as MisTareasItem[]

  // 9) Ordenar:
  //    - cerradas/completadas al final
  //    - resto: fecha_limite ASC NULLS LAST
  //    - tiebreaker: planes con prioridad alta primero (s5 no tiene prioridad)
  const prioridadOrden: Record<string, number> = { alta: 0, media: 1, baja: 2 }

  items.sort((a, b) => {
    const aDone = a.estado_unificado === "cerrada"
    const bDone = b.estado_unificado === "cerrada"
    if (aDone !== bDone) return aDone ? 1 : -1

    if (a.fecha_limite && !b.fecha_limite) return -1
    if (!a.fecha_limite && b.fecha_limite) return 1
    if (a.fecha_limite && b.fecha_limite) {
      const cmp = a.fecha_limite.localeCompare(b.fecha_limite)
      if (cmp !== 0) return cmp
    }

    const aPri =
      a.origen === "plan_accion" ? prioridadOrden[a.prioridad] ?? 99 : 99
    const bPri =
      b.origen === "plan_accion" ? prioridadOrden[b.prioridad] ?? 99 : 99
    return aPri - bPri
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

// ---------- Evidencia obligatoria ----------

/**
 * Activa/desactiva la evidencia obligatoria de un plan. Solo admin.
 */
export async function togglePlanEvidenciaObligatoria(
  planId: string,
  obligatoria: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return {
        ok: false,
        error: "Sólo un administrador puede cambiar este ajuste.",
      }
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from("planes_accion")
      .update({ evidencia_obligatoria: obligatoria })
      .eq("id", planId)
    if (error) return { ok: false, error: error.message }

    revalidatePath(`/planes/${planId}`)
    revalidatePath("/planes")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error actualizando el ajuste de evidencia",
    }
  }
}

// ---------- Cerrar plan ----------

/**
 * Cierra un plan (estado=completado, progreso=100).
 * Si el plan tiene evidencia_obligatoria=true, requiere al menos 1 evidencia
 * (vía evidencia_planes o dpo_archivo_planes) o cierre forzado por admin con motivo.
 *
 * Si se pasa `opts.seguimiento`, además crea una tarea de seguimiento nueva
 * que hereda título/descripción/responsables/punto/prioridad/evidencia de la
 * original, nace "pendiente" con la nueva fecha límite y queda enlazada vía
 * origen_plan_id. La original queda cerrada.
 */
export async function cerrarPlan(
  planId: string,
  opts: {
    sinEvidencia?: boolean
    motivoSinEvidencia?: string
    seguimiento?: { fecha_limite: string }
  }
): Promise<
  { ok: true; seguimientoId?: string } | { ok: false; error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // 1) leer plan
    const { data: planRow, error: getErr } = await supabase
      .from("planes_accion")
      .select(
        "estado, evidencia_obligatoria, titulo, descripcion, tipo, pregunta_id, prioridad"
      )
      .eq("id", planId)
      .single()

    if (getErr || !planRow) {
      return { ok: false, error: getErr?.message ?? "Plan no encontrado" }
    }

    const plan = planRow as {
      estado: EstadoPlan
      evidencia_obligatoria: boolean
      titulo: string | null
      descripcion: string
      tipo: string
      pregunta_id: string | null
      prioridad: string
    }

    // El plan se considera "respondido" si tiene al menos una respuesta:
    // un avance del Action Log (comentario o archivo), un comentario, o una
    // evidencia/archivo vinculado. Un comentario solo ya cuenta.
    const [
      { count: evCount },
      { count: archCount },
      { count: avanceCount },
      { count: comentCount },
    ] = await Promise.all([
      supabase
        .from("evidencia_planes")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId),
      supabase
        .from("dpo_archivo_planes")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId),
      supabase
        .from("planes_accion_avances")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId),
      supabase
        .from("plan_comentarios")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId),
    ])

    const totalEvidencias =
      (evCount ?? 0) + (archCount ?? 0) + (avanceCount ?? 0) + (comentCount ?? 0)

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
          error:
            "Este plan tiene que estar respondido (un comentario o archivo) antes de cerrarse. Respondé al menos una vez o forzá el cierre con motivo.",
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

    // 5) tarea de seguimiento (opcional): clona la original y la enlaza
    let seguimientoId: string | undefined
    if (opts.seguimiento?.fecha_limite) {
      const hoy = new Date().toISOString().slice(0, 10)
      const { data: nuevo, error: segErr } = await supabase
        .from("planes_accion")
        .insert({
          pregunta_id: plan.pregunta_id,
          tipo: plan.tipo,
          titulo: plan.titulo,
          descripcion: plan.descripcion,
          responsable: "", // los reales se copian a plan_responsables abajo
          fecha_inicio: hoy,
          fecha_limite: opts.seguimiento.fecha_limite,
          estado: "pendiente",
          prioridad: plan.prioridad,
          evidencia_obligatoria: plan.evidencia_obligatoria,
          origen_plan_id: planId,
          created_by: profile.id,
        })
        .select("id")
        .single()

      if (segErr || !nuevo) {
        // La original ya quedó cerrada; informamos pero no abortamos el cierre.
        return {
          ok: false,
          error: `Tarea cerrada, pero no se pudo crear el seguimiento: ${
            segErr?.message ?? "error desconocido"
          }`,
        }
      }

      seguimientoId = (nuevo as { id: string }).id

      // Copiar responsables (mismos profile_id y rol) a la nueva tarea
      const { data: resps } = await supabase
        .from("plan_responsables")
        .select("profile_id, rol")
        .eq("plan_id", planId)

      const filas = (
        (resps ?? []) as Array<{ profile_id: string; rol: PlanResponsableRol }>
      ).map((r) => ({
        plan_id: seguimientoId!,
        profile_id: r.profile_id,
        rol: r.rol,
        asignado_por: profile.id,
      }))
      if (filas.length > 0) {
        await supabase.from("plan_responsables").insert(filas)
      }

      revalidatePath(`/planes/${seguimientoId}`)
      revalidatePath("/registro-tareas")
    }

    revalidatePath("/planes")
    revalidatePath(`/planes/${planId}`)
    revalidatePath("/mis-tareas")
    return { ok: true, seguimientoId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error cerrando plan",
    }
  }
}

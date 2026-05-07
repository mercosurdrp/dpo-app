"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { revalidatePath } from "next/cache"
import type {
  EstadoPlan,
  Profile,
  PrioridadPlan,
} from "@/types/database"

// ============================================================
// Tipos del módulo
// ============================================================

export interface PuntoManualSearchResult {
  pregunta_id: string
  numero: string
  texto: string
  bloque_id: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
  guia: string | null
  requerimiento: string | null
  como_verificar: string | null
}

export interface RegistroTareaItem {
  id: string
  titulo: string | null
  descripcion: string
  estado: EstadoPlan
  prioridad: PrioridadPlan
  fecha_limite: string | null
  evidencia_obligatoria: boolean
  created_at: string
  created_by: string | null
  creador_nombre: string
  responsables: Array<{ profile_id: string; nombre: string }>
  pregunta_id: string | null
  pregunta_numero: string | null
  pregunta_texto: string | null
  bloque_nombre: string | null
  pilar_id: string | null
  pilar_nombre: string | null
  pilar_color: string | null
  evidencias_count: number
}

export interface RegistroTareasFiltros {
  pilarId?: string
  bloqueId?: string
  preguntaId?: string
  responsableId?: string
  estado?: EstadoPlan | "all"
  fechaDesde?: string
  fechaHasta?: string
  query?: string
}

// ============================================================
// Permisos
// ============================================================

async function getProfileWithFlags(): Promise<Profile> {
  return await requireAuth()
}

function puedeAsignar(profile: Profile): boolean {
  return (
    profile.role === "admin" ||
    profile.role === "auditor" ||
    profile.puede_asignar_tareas === true
  )
}

export async function getPermisoCrearTareas(): Promise<boolean> {
  const profile = await getProfileWithFlags()
  return puedeAsignar(profile)
}

// ============================================================
// Listado de operadores asignables
// ============================================================

export async function getOperadoresParaAsignar(): Promise<
  Array<{ id: string; nombre: string; email: string | null; role: string }>
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre, email, role")
    .eq("active", true)
    .order("nombre", { ascending: true })

  return (data ?? []) as Array<{
    id: string
    nombre: string
    email: string | null
    role: string
  }>
}

// ============================================================
// Buscador inteligente de puntos del manual
// ============================================================

export async function searchPuntosManual(
  query: string,
  limit = 25
): Promise<PuntoManualSearchResult[]> {
  const supabase = await createClient()
  const q = query.trim()

  let preguntasQuery = supabase
    .from("preguntas")
    .select("id, numero, texto, bloque_id, guia, requerimiento, como_verificar")
    .order("numero", { ascending: true })
    .limit(limit)

  if (q.length > 0) {
    // Busca match en numero, texto, guia o requerimiento (case-insensitive)
    const escaped = q.replace(/[%,]/g, " ")
    const pattern = `%${escaped}%`
    preguntasQuery = preguntasQuery.or(
      `numero.ilike.${pattern},texto.ilike.${pattern},guia.ilike.${pattern},requerimiento.ilike.${pattern}`
    )
  }

  const { data: preguntas } = await preguntasQuery
  const preguntasList = (preguntas ?? []) as Array<{
    id: string
    numero: string
    texto: string
    bloque_id: string
    guia: string | null
    requerimiento: string | null
    como_verificar: string | null
  }>

  if (preguntasList.length === 0) return []

  const bloqueIds = Array.from(new Set(preguntasList.map((p) => p.bloque_id)))
  const { data: bloques } = await supabase
    .from("bloques")
    .select("id, nombre, pilar_id")
    .in("id", bloqueIds)

  const bloqueMap = new Map(
    ((bloques ?? []) as Array<{ id: string; nombre: string; pilar_id: string }>).map((b) => [
      b.id,
      b,
    ])
  )

  const pilarIds = Array.from(
    new Set((bloques ?? []).map((b: { pilar_id: string }) => b.pilar_id))
  )
  const { data: pilares } = await supabase
    .from("pilares")
    .select("id, nombre, color")
    .in("id", pilarIds)

  const pilarMap = new Map(
    ((pilares ?? []) as Array<{ id: string; nombre: string; color: string }>).map((p) => [
      p.id,
      p,
    ])
  )

  const result: PuntoManualSearchResult[] = preguntasList.map((p) => {
    const b = bloqueMap.get(p.bloque_id)
    const pi = b ? pilarMap.get(b.pilar_id) : undefined
    return {
      pregunta_id: p.id,
      numero: p.numero,
      texto: p.texto,
      bloque_id: p.bloque_id,
      bloque_nombre: b?.nombre ?? "",
      pilar_id: b?.pilar_id ?? "",
      pilar_nombre: pi?.nombre ?? "",
      pilar_color: pi?.color ?? "#64748B",
      guia: p.guia,
      requerimiento: p.requerimiento,
      como_verificar: p.como_verificar,
    }
  })

  return result
}

// ============================================================
// Crear tarea directa
// ============================================================

export async function crearTareaDirecta(input: {
  titulo: string
  descripcion: string
  responsable_ids: string[]
  fecha_limite: string | null
  prioridad?: PrioridadPlan
  evidencia_obligatoria: boolean
  pregunta_id?: string | null
}): Promise<{ data: { id: string } } | { error: string }> {
  try {
    const profile = await getProfileWithFlags()
    if (!puedeAsignar(profile)) {
      return { error: "No tenés permiso para crear tareas." }
    }

    if (!input.titulo.trim()) return { error: "El título es requerido." }
    if (!input.descripcion.trim())
      return { error: "La descripción es requerida." }
    if (!input.responsable_ids || input.responsable_ids.length === 0) {
      return { error: "Asigná al menos un responsable." }
    }

    const supabase = await createClient()

    // Insert plan
    const { data: plan, error: planErr } = await supabase
      .from("planes_accion")
      .insert({
        pregunta_id: input.pregunta_id ?? null,
        tipo: "directa",
        titulo: input.titulo.trim(),
        descripcion: input.descripcion.trim(),
        responsable: "", // legacy column NOT NULL → string vacío; los reales viven en plan_responsables
        fecha_limite: input.fecha_limite,
        prioridad: input.prioridad ?? "media",
        evidencia_obligatoria: input.evidencia_obligatoria,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (planErr || !plan) {
      return { error: planErr?.message ?? "No se pudo crear la tarea." }
    }

    const planId = plan.id as string

    // Insert responsables: el primero queda como principal, el resto coresponsables
    const rows = input.responsable_ids.map((profile_id, idx) => ({
      plan_id: planId,
      profile_id,
      rol:
        idx === 0
          ? ("responsable_principal" as const)
          : ("coresponsable" as const),
      asignado_por: profile.id,
    }))

    const { error: respErr } = await supabase
      .from("plan_responsables")
      .insert(rows)

    if (respErr) {
      // Rollback manual: borrar el plan recién creado
      await supabase.from("planes_accion").delete().eq("id", planId)
      return {
        error: `No se pudieron asignar los responsables: ${respErr.message}`,
      }
    }

    revalidatePath("/registro-tareas")
    revalidatePath("/mis-tareas")
    revalidatePath("/planes")

    return { data: { id: planId } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando tarea",
    }
  }
}

// ============================================================
// Asociar / cambiar punto del manual de una tarea
// ============================================================

export async function asociarPuntoManual(
  planId: string,
  preguntaId: string | null
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await getProfileWithFlags()
    if (!puedeAsignar(profile)) {
      return { error: "No tenés permiso para editar el punto del manual." }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("planes_accion")
      .update({ pregunta_id: preguntaId })
      .eq("id", planId)

    if (error) return { error: error.message }

    revalidatePath(`/planes/${planId}`)
    revalidatePath("/registro-tareas")
    revalidatePath("/mis-tareas")

    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando punto",
    }
  }
}

// ============================================================
// Registro de tareas (vista para defender auditoría)
// ============================================================

export async function getRegistroTareasDirectas(
  filtros: RegistroTareasFiltros = {}
): Promise<{ data: RegistroTareaItem[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // 1) Planes (filtrados)
    let planesQ = supabase
      .from("planes_accion")
      .select("*")
      .eq("tipo", "directa")
      .order("created_at", { ascending: false })

    if (filtros.estado && filtros.estado !== "all") {
      planesQ = planesQ.eq("estado", filtros.estado)
    }
    if (filtros.fechaDesde) {
      planesQ = planesQ.gte("created_at", filtros.fechaDesde)
    }
    if (filtros.fechaHasta) {
      planesQ = planesQ.lte("created_at", filtros.fechaHasta)
    }
    if (filtros.preguntaId) {
      planesQ = planesQ.eq("pregunta_id", filtros.preguntaId)
    }

    const { data: planesRaw, error: planesErr } = await planesQ
    if (planesErr) return { error: planesErr.message }

    type PlanRow = {
      id: string
      titulo: string | null
      descripcion: string
      estado: EstadoPlan
      prioridad: PrioridadPlan
      fecha_limite: string | null
      evidencia_obligatoria: boolean
      created_at: string
      created_by: string | null
      pregunta_id: string | null
    }
    const planes = (planesRaw ?? []) as PlanRow[]
    if (planes.length === 0) return { data: [] }

    const planIds = planes.map((p) => p.id)

    // 2) Responsables
    const { data: respRows } = await supabase
      .from("plan_responsables")
      .select("plan_id, profile_id")
      .in("plan_id", planIds)

    const profileIds = Array.from(
      new Set(
        ((respRows ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id)
      )
    )
    const creadorIds = planes
      .map((p) => p.created_by)
      .filter((id): id is string => !!id)
    const allProfileIds = Array.from(new Set([...profileIds, ...creadorIds]))

    const { data: profilesRows } = allProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id, nombre")
          .in("id", allProfileIds)
      : { data: [] as Array<{ id: string; nombre: string }> }

    const profileMap = new Map(
      ((profilesRows ?? []) as Array<{ id: string; nombre: string }>).map((p) => [
        p.id,
        p.nombre,
      ])
    )

    const respByPlan = new Map<string, Array<{ profile_id: string; nombre: string }>>()
    for (const r of (respRows ?? []) as Array<{
      plan_id: string
      profile_id: string
    }>) {
      const arr = respByPlan.get(r.plan_id) ?? []
      arr.push({
        profile_id: r.profile_id,
        nombre: profileMap.get(r.profile_id) ?? "—",
      })
      respByPlan.set(r.plan_id, arr)
    }

    // 3) Preguntas / bloques / pilares (con filtros pilarId/bloqueId)
    const preguntaIds = Array.from(
      new Set(planes.map((p) => p.pregunta_id).filter((id): id is string => !!id))
    )

    const { data: preguntasRows } = preguntaIds.length
      ? await supabase
          .from("preguntas")
          .select("id, numero, texto, bloque_id")
          .in("id", preguntaIds)
      : {
          data: [] as Array<{
            id: string
            numero: string
            texto: string
            bloque_id: string
          }>,
        }

    const preguntaMap = new Map(
      ((preguntasRows ?? []) as Array<{
        id: string
        numero: string
        texto: string
        bloque_id: string
      }>).map((p) => [p.id, p])
    )

    const bloqueIds = Array.from(
      new Set(
        ((preguntasRows ?? []) as Array<{ bloque_id: string }>).map((p) => p.bloque_id)
      )
    )
    const { data: bloquesRows } = bloqueIds.length
      ? await supabase
          .from("bloques")
          .select("id, nombre, pilar_id")
          .in("id", bloqueIds)
      : {
          data: [] as Array<{ id: string; nombre: string; pilar_id: string }>,
        }

    const bloqueMap = new Map(
      ((bloquesRows ?? []) as Array<{
        id: string
        nombre: string
        pilar_id: string
      }>).map((b) => [b.id, b])
    )

    const pilarIds = Array.from(
      new Set(
        ((bloquesRows ?? []) as Array<{ pilar_id: string }>).map((b) => b.pilar_id)
      )
    )
    const { data: pilaresRows } = pilarIds.length
      ? await supabase
          .from("pilares")
          .select("id, nombre, color")
          .in("id", pilarIds)
      : {
          data: [] as Array<{ id: string; nombre: string; color: string }>,
        }

    const pilarMap = new Map(
      ((pilaresRows ?? []) as Array<{
        id: string
        nombre: string
        color: string
      }>).map((p) => [p.id, p])
    )

    // 4) Conteo de evidencias por plan
    const { data: evLinks } = await supabase
      .from("evidencia_planes")
      .select("plan_id")
      .in("plan_id", planIds)

    const evCount = new Map<string, number>()
    for (const r of (evLinks ?? []) as Array<{ plan_id: string }>) {
      evCount.set(r.plan_id, (evCount.get(r.plan_id) ?? 0) + 1)
    }

    // 5) Construir items + filtros que requieren joins
    let items: RegistroTareaItem[] = planes.map((plan) => {
      const pregunta = plan.pregunta_id ? preguntaMap.get(plan.pregunta_id) : undefined
      const bloque = pregunta ? bloqueMap.get(pregunta.bloque_id) : undefined
      const pilar = bloque ? pilarMap.get(bloque.pilar_id) : undefined

      return {
        id: plan.id,
        titulo: plan.titulo,
        descripcion: plan.descripcion,
        estado: plan.estado,
        prioridad: plan.prioridad,
        fecha_limite: plan.fecha_limite,
        evidencia_obligatoria: plan.evidencia_obligatoria,
        created_at: plan.created_at,
        created_by: plan.created_by,
        creador_nombre: plan.created_by
          ? profileMap.get(plan.created_by) ?? "—"
          : "—",
        responsables: respByPlan.get(plan.id) ?? [],
        pregunta_id: plan.pregunta_id,
        pregunta_numero: pregunta?.numero ?? null,
        pregunta_texto: pregunta?.texto ?? null,
        bloque_nombre: bloque?.nombre ?? null,
        pilar_id: bloque?.pilar_id ?? null,
        pilar_nombre: pilar?.nombre ?? null,
        pilar_color: pilar?.color ?? null,
        evidencias_count: evCount.get(plan.id) ?? 0,
      }
    })

    // Filtros post-join
    if (filtros.pilarId) {
      items = items.filter((t) => t.pilar_id === filtros.pilarId)
    }
    if (filtros.bloqueId) {
      const bloque = bloqueMap.get(filtros.bloqueId)
      if (bloque) {
        items = items.filter((t) => {
          const preg = t.pregunta_id ? preguntaMap.get(t.pregunta_id) : undefined
          return preg?.bloque_id === filtros.bloqueId
        })
      } else {
        items = []
      }
    }
    if (filtros.responsableId) {
      items = items.filter((t) =>
        t.responsables.some((r) => r.profile_id === filtros.responsableId)
      )
    }
    if (filtros.query && filtros.query.trim().length > 0) {
      const q = filtros.query.trim().toLowerCase()
      items = items.filter(
        (t) =>
          (t.titulo ?? "").toLowerCase().includes(q) ||
          t.descripcion.toLowerCase().includes(q) ||
          (t.pregunta_numero ?? "").toLowerCase().includes(q) ||
          (t.pregunta_texto ?? "").toLowerCase().includes(q)
      )
    }

    return { data: items }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando registro",
    }
  }
}

// ============================================================
// Pilares + bloques para los filtros del registro
// ============================================================

export async function getPilaresParaFiltro(): Promise<
  Array<{ id: string; nombre: string; color: string }>
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("pilares")
    .select("id, nombre, color")
    .order("orden", { ascending: true })
  return (data ?? []) as Array<{ id: string; nombre: string; color: string }>
}

export async function getBloquesParaFiltro(
  pilarId?: string
): Promise<Array<{ id: string; nombre: string; pilar_id: string }>> {
  const supabase = await createClient()
  let q = supabase
    .from("bloques")
    .select("id, nombre, pilar_id")
    .order("orden", { ascending: true })

  if (pilarId) q = q.eq("pilar_id", pilarId)

  const { data } = await q
  return (data ?? []) as Array<{ id: string; nombre: string; pilar_id: string }>
}

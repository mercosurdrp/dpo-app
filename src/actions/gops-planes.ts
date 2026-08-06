"use server"

/**
 * Planes de acción sobre GOPs y Toolkits. Mismo modelo que tlp-planes / rechazos-planes:
 * plan + avances incrementales con evidencia adjunta.
 *
 * Lo propio de acá es el HORIZONTE. Un plan 'corto' se busca cerrar en el mes o el
 * trimestre; uno 'largo' es estructural (inversión, terceros) y no tiene por qué
 * ensuciar la lista de trabajo del mes — pero sigue registrado, que es lo que el punto
 * 4.5 pide ver al lado de cada respuesta.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  archivosDeFila,
  archivosDelForm,
  columnasArchivos,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"

const BUCKET = "gops-planes"
const GOPS_PATH = "/planeamiento/gops"

type Result<T> = { data: T } | { error: string }

export type EstadoGopPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadGopPlan = "alta" | "media" | "baja"
export type HorizonteGopPlan = "corto" | "largo"

const ESTADOS: EstadoGopPlan[] = ["pendiente", "en_progreso", "completado"]
const PRIORIDADES: PrioridadGopPlan[] = ["alta", "media", "baja"]
const HORIZONTES: HorizonteGopPlan[] = ["corto", "largo"]

export interface GopPlan {
  id: string
  tema_id: string
  tema_nombre: string | null
  titulo: string
  descripcion: string | null
  horizonte: HorizonteGopPlan
  prioridad: PrioridadGopPlan
  estado: EstadoGopPlan
  responsable_id: string | null
  responsable_nombre: string | null
  fecha_objetivo: string | null
  created_by: string | null
  created_by_nombre: string | null
  created_at: string
  updated_at: string
  avances_count: number
  /** Preguntas del GOP que este plan viene a resolver. */
  puntos: Array<{ pregunta_id: string; codigo: string; texto: string }>
}

export interface GopPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  archivos: ArchivoAvance[]
  estado_resultante: EstadoGopPlan | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

export async function listarPlanesGops(filtro?: {
  temaId?: string
  estado?: EstadoGopPlan
  horizonte?: HorizonteGopPlan
}): Promise<Result<GopPlan[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let q = supabase
      .from("gops_planes")
      .select(
        "*, tema:gops_temas(nombre), responsable:profiles!gops_planes_responsable_id_fkey(id, nombre), autor:profiles!gops_planes_created_by_fkey(id, nombre)",
      )
      .order("created_at", { ascending: false })

    if (filtro?.temaId) q = q.eq("tema_id", filtro.temaId)
    if (filtro?.estado) q = q.eq("estado", filtro.estado)
    if (filtro?.horizonte) q = q.eq("horizonte", filtro.horizonte)

    const { data, error } = await q
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as unknown as any[]
    const ids = rows.map((r) => r.id as string)

    const avancesPorPlan = new Map<string, number>()
    const puntosPorPlan = new Map<string, GopPlan["puntos"]>()

    if (ids.length) {
      const [avs, decs] = await Promise.all([
        supabase.from("gops_planes_avances").select("plan_id").in("plan_id", ids),
        supabase
          .from("gops_decisiones")
          .select("plan_id, pregunta_id, gops_preguntas:pregunta_id(codigo, texto)")
          .in("plan_id", ids),
      ])
      for (const a of (avs.data ?? []) as Array<{ plan_id: string }>) {
        avancesPorPlan.set(a.plan_id, (avancesPorPlan.get(a.plan_id) ?? 0) + 1)
      }
      for (const d of (decs.data ?? []) as unknown as Array<{
        plan_id: string
        pregunta_id: string
        gops_preguntas: { codigo: string; texto: string } | null
      }>) {
        const arr = puntosPorPlan.get(d.plan_id) ?? []
        arr.push({
          pregunta_id: d.pregunta_id,
          codigo: d.gops_preguntas?.codigo ?? "",
          texto: d.gops_preguntas?.texto ?? "",
        })
        puntosPorPlan.set(d.plan_id, arr)
      }
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        tema_id: r.tema_id,
        tema_nombre: r.tema?.nombre ?? null,
        titulo: r.titulo,
        descripcion: r.descripcion ?? null,
        horizonte: (r.horizonte as HorizonteGopPlan) ?? "corto",
        prioridad: (r.prioridad as PrioridadGopPlan) ?? "media",
        estado: (r.estado as EstadoGopPlan) ?? "pendiente",
        responsable_id: r.responsable_id ?? null,
        responsable_nombre: r.responsable?.nombre ?? null,
        fecha_objetivo: r.fecha_objetivo ?? null,
        created_by: r.created_by ?? null,
        created_by_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        avances_count: avancesPorPlan.get(r.id) ?? 0,
        puntos: puntosPorPlan.get(r.id) ?? [],
      })),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los planes" }
  }
}

// ---------------------------------------------------------------------------
// Crear / editar
// ---------------------------------------------------------------------------

/**
 * Crea el plan. Si viene `pregunta_id`, además deja registrada la decisión de ese punto
 * apuntando al plan: crear el plan y decidir el "No" son un solo gesto para quien lo usa.
 */
export async function crearPlanGop(formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!isEditorRole(profile.role)) return { error: "Solo editores pueden crear planes" }
    const supabase = await createClient()

    const temaId = String(formData.get("tema_id") ?? "").trim()
    if (!temaId) return { error: "Falta el GOP al que pertenece el plan" }

    const titulo = String(formData.get("titulo") ?? "").trim()
    if (!titulo) return { error: "El título es obligatorio" }

    const horizonteRaw = String(formData.get("horizonte") ?? "corto").trim()
    const horizonte = HORIZONTES.includes(horizonteRaw as HorizonteGopPlan)
      ? (horizonteRaw as HorizonteGopPlan)
      : "corto"

    const prioridadRaw = String(formData.get("prioridad") ?? "media").trim()
    const prioridad = PRIORIDADES.includes(prioridadRaw as PrioridadGopPlan)
      ? (prioridadRaw as PrioridadGopPlan)
      : "media"

    const { data, error } = await supabase
      .from("gops_planes")
      .insert({
        tema_id: temaId,
        titulo,
        descripcion: String(formData.get("descripcion") ?? "").trim() || null,
        horizonte,
        prioridad,
        estado: "pendiente",
        responsable_id: String(formData.get("responsable_id") ?? "").trim() || null,
        fecha_objetivo: String(formData.get("fecha_objetivo") ?? "").trim() || null,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error || !data) return { error: error?.message ?? "No se pudo crear el plan" }
    const planId = (data as { id: string }).id

    const preguntaId = String(formData.get("pregunta_id") ?? "").trim()
    if (preguntaId) {
      const { error: errDec } = await supabase.from("gops_decisiones").upsert(
        {
          pregunta_id: preguntaId,
          destino: "plan",
          motivo: String(formData.get("motivo") ?? "").trim() || null,
          fecha_revision: String(formData.get("fecha_revision") ?? "").trim() || null,
          plan_id: planId,
          decidido_por: profile.id,
          decidido_en: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pregunta_id" },
      )
      // El plan quedó creado; si falla la decisión hay que avisarlo, no tragarlo.
      if (errDec) return { error: `Plan creado, pero no se pudo asociar el punto: ${errDec.message}` }
    }

    revalidatePath(GOPS_PATH)
    return { data: { id: planId } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando el plan" }
  }
}

/** Suma un punto más (otra pregunta en "No") a un plan que ya existe. */
export async function asociarPuntoAPlan(
  preguntaId: string,
  planId: string,
): Promise<Result<{ ok: true }>> {
  const profile = await requireAuth()
  if (!isEditorRole(profile.role)) return { error: "Solo editores pueden asociar puntos" }
  const supabase = await createClient()

  const { error } = await supabase.from("gops_decisiones").upsert(
    {
      pregunta_id: preguntaId,
      destino: "plan",
      plan_id: planId,
      decidido_por: profile.id,
      decidido_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pregunta_id" },
  )
  if (error) return { error: error.message }

  revalidatePath(GOPS_PATH)
  return { data: { ok: true } }
}

export async function actualizarPlanGop(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("gops_planes")
      .select("created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }

    const p = plan as { created_by: string | null; responsable_id: string | null }
    if (!isEditorRole(profile.role) && p.created_by !== profile.id && p.responsable_id !== profile.id) {
      return { error: "No tenés permiso para editar este plan" }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (formData.has("titulo")) {
      const t = String(formData.get("titulo") ?? "").trim()
      if (!t) return { error: "El título no puede quedar vacío" }
      updates.titulo = t
    }
    if (formData.has("descripcion")) {
      updates.descripcion = String(formData.get("descripcion") ?? "").trim() || null
    }
    if (formData.has("horizonte")) {
      const h = String(formData.get("horizonte") ?? "").trim()
      if (!HORIZONTES.includes(h as HorizonteGopPlan)) return { error: "Horizonte inválido" }
      updates.horizonte = h
    }
    if (formData.has("prioridad")) {
      const pr = String(formData.get("prioridad") ?? "").trim()
      if (PRIORIDADES.includes(pr as PrioridadGopPlan)) updates.prioridad = pr
    }
    if (formData.has("estado")) {
      const e = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS.includes(e as EstadoGopPlan)) return { error: "Estado inválido" }
      updates.estado = e
    }
    if (formData.has("responsable_id")) {
      updates.responsable_id = String(formData.get("responsable_id") ?? "").trim() || null
    }
    if (formData.has("fecha_objetivo")) {
      updates.fecha_objetivo = String(formData.get("fecha_objetivo") ?? "").trim() || null
    }

    const { error } = await supabase.from("gops_planes").update(updates).eq("id", planId)
    if (error) return { error: error.message }

    revalidatePath(GOPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error editando el plan" }
  }
}

export async function eliminarPlanGop(planId: string): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: plan } = await supabase
      .from("gops_planes")
      .select("created_by")
      .eq("id", planId)
      .single()
    const creador = (plan as { created_by: string | null } | null)?.created_by
    if (!isEditorRole(profile.role) && creador !== profile.id) {
      return { error: "No tenés permiso para eliminar este plan" }
    }

    // Los adjuntos se borran a mano: la FK cascadea las filas, no el storage.
    const { data: avances } = await supabase
      .from("gops_planes_avances")
      .select("*")
      .eq("plan_id", planId)
    const paths = ((avances ?? []) as unknown as Array<Record<string, unknown>>).flatMap((a) =>
      archivosDeFila(a).map((x) => x.path),
    )

    const { error } = await supabase.from("gops_planes").delete().eq("id", planId)
    if (error) return { error: error.message }
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(GOPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando el plan" }
  }
}

// ---------------------------------------------------------------------------
// Avances
// ---------------------------------------------------------------------------

export async function listarAvancesPlanGop(planId: string): Promise<Result<GopPlanAvance[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("gops_planes_avances")
      .select("*, autor:profiles!gops_planes_avances_autor_id_fkey(id, nombre)")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: ((data ?? []) as unknown as any[]).map((r) => ({
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivos: archivosDeFila(r),
        estado_resultante: (r.estado_resultante as EstadoGopPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      })),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los avances" }
  }
}

export async function agregarAvancePlanGop(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("gops_planes")
      .select("estado, created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }

    const planRow = plan as {
      estado: EstadoGopPlan
      created_by: string | null
      responsable_id: string | null
    }
    if (
      !isEditorRole(profile.role) &&
      planRow.created_by !== profile.id &&
      planRow.responsable_id !== profile.id
    ) {
      return { error: "Solo el responsable o un editor puede cargar avances" }
    }

    const comentario = String(formData.get("comentario") ?? "").trim() || null
    const files = archivosDelForm(formData)
    if (!comentario && files.length === 0) {
      return { error: "Cargá un comentario o adjuntá evidencia" }
    }

    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    let nuevoEstado: EstadoGopPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS.includes(nuevoEstadoRaw as EstadoGopPlan)) return { error: "Estado inválido" }
      nuevoEstado = nuevoEstadoRaw as EstadoGopPlan
    }

    let archivos: ArchivoAvance[] = []
    if (files.length) {
      const subida = await subirArchivosAvance(supabase, BUCKET, planId, files)
      if ("error" in subida) return { error: subida.error }
      archivos = subida.archivos
    }

    const { error: errAv } = await supabase.from("gops_planes_avances").insert({
      plan_id: planId,
      comentario,
      ...columnasArchivos(archivos),
      estado_resultante: nuevoEstado,
      autor_id: profile.id,
    })

    if (errAv) {
      if (archivos.length) {
        await supabase.storage.from(BUCKET).remove(archivos.map((a) => a.path))
      }
      return { error: errAv.message }
    }

    if (nuevoEstado && nuevoEstado !== planRow.estado) {
      await supabase
        .from("gops_planes")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", planId)
    }

    revalidatePath(GOPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error registrando el avance" }
  }
}

/** URL firmada para abrir un adjunto (el bucket es privado). */
export async function urlArchivoGop(path: string): Promise<Result<{ url: string }>> {
  await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data) return { error: error?.message ?? "No se pudo abrir el archivo" }
  return { data: { url: data.signedUrl } }
}

/** Gente que puede quedar como responsable de un plan. */
export async function listarResponsablesGops(): Promise<
  Array<{ id: string; nombre: string }>
> {
  await requireAuth()
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("id, nombre")
    .in("role", ["admin", "supervisor", "admin_rrhh"])
    .order("nombre")
  return (data ?? []) as Array<{ id: string; nombre: string }>
}

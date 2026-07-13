"use server"

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

const BUCKET = "tlp-planes"
const TLP_PATH = "/indicadores/tlp"

export type EstadoTlpPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadTlpPlan = "alta" | "media" | "baja"

const ESTADOS_VALIDOS: EstadoTlpPlan[] = ["pendiente", "en_progreso", "completado"]
const PRIORIDADES_VALIDAS: PrioridadTlpPlan[] = ["alta", "media", "baja"]

type Result<T> = { data: T } | { error: string }

export interface TlpPlan {
  id: string
  titulo: string
  descripcion: string | null
  /** Segmento opcional: ciudad a la que apunta el plan (null = general). */
  foco_ciudad: string | null
  /** Segmento opcional: patente/camión al que apunta el plan (null = general). */
  foco_patente: string | null
  prioridad: PrioridadTlpPlan
  estado: EstadoTlpPlan
  responsable_id: string | null
  responsable_nombre: string | null
  fecha_objetivo: string | null
  created_by: string | null
  created_by_nombre: string | null
  created_at: string
  updated_at: string
  avances_count: number
}

export interface TlpPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  /** Todos los adjuntos del avance. Los avances viejos traen acá su único archivo. */
  archivos: ArchivoAvance[]
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: EstadoTlpPlan | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

export interface TlpPlanFiltro {
  foco_ciudad?: string
  foco_patente?: string
  estado?: EstadoTlpPlan
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

// ------------------------------------------------------------------
// Listado de planes (con autor, responsable y conteo de avances)
// ------------------------------------------------------------------
export async function listarPlanesTlp(
  filtro?: TlpPlanFiltro,
): Promise<Result<TlpPlan[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let q = supabase
      .from("tlp_planes")
      .select(
        "*, responsable:profiles!tlp_planes_responsable_id_fkey(id, nombre), autor:profiles!tlp_planes_created_by_fkey(id, nombre)",
      )
      .order("created_at", { ascending: false })

    if (filtro?.foco_ciudad) q = q.eq("foco_ciudad", filtro.foco_ciudad)
    if (filtro?.foco_patente) q = q.eq("foco_patente", filtro.foco_patente)
    if (filtro?.estado) q = q.eq("estado", filtro.estado)

    const { data, error } = await q
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    const ids = rows.map((r) => r.id as string)

    const countMap = new Map<string, number>()
    if (ids.length) {
      const { data: avs } = await supabase
        .from("tlp_planes_avances")
        .select("plan_id")
        .in("plan_id", ids)
      for (const a of (avs ?? []) as Array<{ plan_id: string }>) {
        countMap.set(a.plan_id, (countMap.get(a.plan_id) ?? 0) + 1)
      }
    }

    const planes: TlpPlan[] = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion ?? null,
        foco_ciudad: r.foco_ciudad ?? null,
        foco_patente: r.foco_patente ?? null,
        prioridad: (r.prioridad as PrioridadTlpPlan) ?? "media",
        estado: (r.estado as EstadoTlpPlan) ?? "pendiente",
        responsable_id: r.responsable_id ?? null,
        responsable_nombre: r.responsable?.nombre ?? null,
        fecha_objetivo: r.fecha_objetivo ?? null,
        created_by: r.created_by ?? null,
        created_by_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        avances_count: countMap.get(r.id) ?? 0,
      }
    })

    return { data: planes }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los planes" }
  }
}

// ------------------------------------------------------------------
// Crear plan
// ------------------------------------------------------------------
export async function crearPlanTlp(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!isEditorRole(profile.role)) {
      return { error: "Solo editores pueden crear planes de acción" }
    }
    const supabase = await createClient()

    const titulo = String(formData.get("titulo") ?? "").trim()
    if (!titulo) return { error: "El título es obligatorio" }

    const descripcion = String(formData.get("descripcion") ?? "").trim() || null
    const prioridadRaw = String(formData.get("prioridad") ?? "media").trim()
    const prioridad = PRIORIDADES_VALIDAS.includes(prioridadRaw as PrioridadTlpPlan)
      ? (prioridadRaw as PrioridadTlpPlan)
      : "media"

    const focoCiudad = String(formData.get("foco_ciudad") ?? "").trim() || null
    const focoPatente =
      String(formData.get("foco_patente") ?? "").trim().toUpperCase() || null
    const responsableId =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fechaObjetivo =
      String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { data, error } = await supabase
      .from("tlp_planes")
      .insert({
        titulo,
        descripcion,
        prioridad,
        estado: "pendiente",
        foco_ciudad: focoCiudad,
        foco_patente: focoPatente,
        responsable_id: responsableId,
        fecha_objetivo: fechaObjetivo,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear el plan" }
    }

    revalidatePath(TLP_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando el plan" }
  }
}

// ------------------------------------------------------------------
// Actualizar plan (campos editables)
// ------------------------------------------------------------------
export async function actualizarPlanTlp(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("tlp_planes")
      .select("created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const p = plan as { created_by: string | null; responsable_id: string | null }
    if (
      !isEditorRole(profile.role) &&
      p.created_by !== profile.id &&
      p.responsable_id !== profile.id
    ) {
      return { error: "No tenés permiso para editar este plan" }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (formData.has("titulo")) {
      const t = String(formData.get("titulo") ?? "").trim()
      if (!t) return { error: "El título no puede quedar vacío" }
      updates.titulo = t
    }
    if (formData.has("descripcion"))
      updates.descripcion = String(formData.get("descripcion") ?? "").trim() || null
    if (formData.has("prioridad")) {
      const pr = String(formData.get("prioridad") ?? "").trim()
      if (PRIORIDADES_VALIDAS.includes(pr as PrioridadTlpPlan)) updates.prioridad = pr
    }
    if (formData.has("estado")) {
      const es = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS_VALIDOS.includes(es as EstadoTlpPlan))
        return { error: "Estado inválido" }
      updates.estado = es
    }
    if (formData.has("foco_ciudad"))
      updates.foco_ciudad = String(formData.get("foco_ciudad") ?? "").trim() || null
    if (formData.has("foco_patente"))
      updates.foco_patente =
        String(formData.get("foco_patente") ?? "").trim().toUpperCase() || null
    if (formData.has("responsable_id"))
      updates.responsable_id =
        String(formData.get("responsable_id") ?? "").trim() || null
    if (formData.has("fecha_objetivo"))
      updates.fecha_objetivo =
        String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { error } = await supabase
      .from("tlp_planes")
      .update(updates)
      .eq("id", planId)
    if (error) return { error: error.message }

    revalidatePath(TLP_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error actualizando el plan" }
  }
}

// ------------------------------------------------------------------
// Eliminar plan (cascade borra avances; limpiamos archivos del bucket)
// ------------------------------------------------------------------
export async function eliminarPlanTlp(
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("tlp_planes")
      .select("created_by")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    if (
      !isEditorRole(profile.role) &&
      (plan as { created_by: string | null }).created_by !== profile.id
    ) {
      return { error: "No tenés permiso para eliminar este plan" }
    }

    // Un avance puede tener varios archivos (columna `archivos`); los viejos
    // sólo tienen archivo_path. archivosDeFila() cubre los dos casos.
    const { data: avs } = await supabase
      .from("tlp_planes_avances")
      .select("archivos, archivo_path, archivo_nombre, archivo_mime, archivo_bytes")
      .eq("plan_id", planId)
    const paths = (
      (avs ?? []) as Array<{
        archivos: unknown
        archivo_path: string | null
      }>
    ).flatMap((a) => archivosDeFila(a).map((x) => x.path))

    const { error } = await supabase.from("tlp_planes").delete().eq("id", planId)
    if (error) return { error: error.message }

    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(TLP_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando el plan" }
  }
}

// ------------------------------------------------------------------
// Avances (seguimiento + evidencia)
// ------------------------------------------------------------------
export async function listarAvancesPlanTlp(
  planId: string,
): Promise<Result<TlpPlanAvance[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("tlp_planes_avances")
      .select("*, autor:profiles!tlp_planes_avances_autor_id_fkey(id, nombre)")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const avances: TlpPlanAvance[] = (
      (data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivos: archivosDeFila(r),
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante: (r.estado_resultante as EstadoTlpPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      }
    })
    return { data: avances }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los avances" }
  }
}

export async function agregarAvancePlanTlp(
  planId: string,
  formData: FormData,
): Promise<Result<TlpPlanAvance>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("tlp_planes")
      .select("estado, created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const planRow = plan as {
      estado: EstadoTlpPlan
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
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    const tieneArchivo = files.length > 0

    let nuevoEstado: EstadoTlpPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoTlpPlan))
        return { error: "Estado inválido" }
      nuevoEstado = nuevoEstadoRaw as EstadoTlpPlan
    }

    if (!tieneArchivo && !comentario) {
      return { error: "Cargá un comentario o adjuntá un archivo de evidencia" }
    }

    let archivos: ArchivoAvance[] = []
    if (tieneArchivo) {
      const subida = await subirArchivosAvance(supabase, BUCKET, planId, files)
      if ("error" in subida) return { error: subida.error }
      archivos = subida.archivos
    }
    const paths = archivos.map((a) => a.path)

    const { data: avance, error: errAv } = await supabase
      .from("tlp_planes_avances")
      .insert({
        plan_id: planId,
        comentario,
        ...columnasArchivos(archivos),
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select("*, autor:profiles!tlp_planes_avances_autor_id_fkey(id, nombre)")
      .single()

    if (errAv || !avance) {
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      return { error: errAv?.message ?? "No se pudo registrar el avance" }
    }

    if (nuevoEstado && nuevoEstado !== planRow.estado) {
      const { error: errUpd } = await supabase
        .from("tlp_planes")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", planId)
      if (errUpd) {
        await supabase
          .from("tlp_planes_avances")
          .delete()
          .eq("id", (avance as { id: string }).id)
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
        return { error: errUpd.message }
      }
    }

    revalidatePath(TLP_PATH)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = avance as any
    return {
      data: {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivos: archivosDeFila(r),
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante: (r.estado_resultante as EstadoTlpPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error registrando el avance" }
  }
}

export async function eliminarAvancePlanTlp(
  avanceId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!avanceId) return { error: "ID de avance inválido" }

    const { data: avance, error: errA } = await supabase
      .from("tlp_planes_avances")
      .select(
        "id, autor_id, archivos, archivo_path, archivo_nombre, archivo_mime, archivo_bytes",
      )
      .eq("id", avanceId)
      .single()
    if (errA || !avance) return { error: errA?.message ?? "Avance no encontrado" }
    const row = avance as {
      autor_id: string | null
      archivos: unknown
      archivo_path: string | null
    }
    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const { error: errDel } = await supabase
      .from("tlp_planes_avances")
      .delete()
      .eq("id", avanceId)
    if (errDel) return { error: errDel.message }

    const paths = archivosDeFila(row).map((a) => a.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(TLP_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando el avance" }
  }
}

export async function getAvanceTlpSignedUrl(
  archivoPath: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!archivoPath) return { error: "Ruta de archivo inválida" }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(archivoPath, 60 * 10)
    if (error || !data) return { error: error?.message ?? "No se pudo generar URL" }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error generando URL" }
  }
}

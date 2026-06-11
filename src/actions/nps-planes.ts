"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

const BUCKET = "nps-planes"
const NPS_PATH = "/nps"

export type EstadoNpsPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadNpsPlan = "alta" | "media" | "baja"

const ESTADOS_VALIDOS: EstadoNpsPlan[] = [
  "pendiente",
  "en_progreso",
  "completado",
]
const PRIORIDADES_VALIDAS: PrioridadNpsPlan[] = ["alta", "media", "baja"]

type Result<T> = { data: T } | { error: string }

export interface NpsPlan {
  id: string
  titulo: string
  descripcion: string | null
  foco_driver: string | null
  foco_cliente_id: number | null
  foco_cliente_nombre: string | null
  foco_promotor: string | null
  prioridad: PrioridadNpsPlan
  estado: EstadoNpsPlan
  responsable_id: string | null
  responsable_nombre: string | null
  fecha_objetivo: string | null
  created_by: string | null
  created_by_nombre: string | null
  created_at: string
  updated_at: string
  avances_count: number
}

export interface NpsPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: EstadoNpsPlan | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80)
}

// ------------------------------------------------------------------
// Listado de planes (con autor, responsable y conteo de avances)
// ------------------------------------------------------------------
export async function listarPlanesNps(): Promise<Result<NpsPlan[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("nps_planes")
      .select(
        "*, responsable:profiles!nps_planes_responsable_id_fkey(id, nombre), autor:profiles!nps_planes_created_by_fkey(id, nombre)",
      )
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    const ids = rows.map((r) => r.id as string)

    const countMap = new Map<string, number>()
    if (ids.length) {
      const { data: avs } = await supabase
        .from("nps_planes_avances")
        .select("plan_id")
        .in("plan_id", ids)
      for (const a of (avs ?? []) as Array<{ plan_id: string }>) {
        countMap.set(a.plan_id, (countMap.get(a.plan_id) ?? 0) + 1)
      }
    }

    const planes: NpsPlan[] = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion ?? null,
        foco_driver: r.foco_driver ?? null,
        foco_cliente_id: r.foco_cliente_id ?? null,
        foco_cliente_nombre: r.foco_cliente_nombre ?? null,
        foco_promotor: r.foco_promotor ?? null,
        prioridad: (r.prioridad as PrioridadNpsPlan) ?? "media",
        estado: (r.estado as EstadoNpsPlan) ?? "pendiente",
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
    return {
      error: err instanceof Error ? err.message : "Error cargando los planes",
    }
  }
}

// ------------------------------------------------------------------
// Crear plan
// ------------------------------------------------------------------
export async function crearPlanNps(
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
    const prioridad = PRIORIDADES_VALIDAS.includes(
      prioridadRaw as PrioridadNpsPlan,
    )
      ? (prioridadRaw as PrioridadNpsPlan)
      : "media"

    const focoDriver = String(formData.get("foco_driver") ?? "").trim() || null
    const focoClienteId = parseIntOrNull(formData.get("foco_cliente_id"))
    const focoClienteNombre =
      String(formData.get("foco_cliente_nombre") ?? "").trim() || null
    const focoPromotor =
      String(formData.get("foco_promotor") ?? "").trim() || null
    const responsableId =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fechaObjetivo =
      String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { data, error } = await supabase
      .from("nps_planes")
      .insert({
        titulo,
        descripcion,
        prioridad,
        estado: "pendiente",
        foco_driver: focoDriver,
        foco_cliente_id: focoClienteId,
        foco_cliente_nombre: focoClienteNombre,
        foco_promotor: focoPromotor,
        responsable_id: responsableId,
        fecha_objetivo: fechaObjetivo,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear el plan" }
    }

    revalidatePath(NPS_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Actualizar plan (campos editables)
// ------------------------------------------------------------------
export async function actualizarPlanNps(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("nps_planes")
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
      if (PRIORIDADES_VALIDAS.includes(pr as PrioridadNpsPlan))
        updates.prioridad = pr
    }
    if (formData.has("estado")) {
      const es = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS_VALIDOS.includes(es as EstadoNpsPlan))
        return { error: "Estado inválido" }
      updates.estado = es
    }
    if (formData.has("foco_driver"))
      updates.foco_driver =
        String(formData.get("foco_driver") ?? "").trim() || null
    if (formData.has("foco_cliente_id"))
      updates.foco_cliente_id = parseIntOrNull(formData.get("foco_cliente_id"))
    if (formData.has("foco_cliente_nombre"))
      updates.foco_cliente_nombre =
        String(formData.get("foco_cliente_nombre") ?? "").trim() || null
    if (formData.has("foco_promotor"))
      updates.foco_promotor =
        String(formData.get("foco_promotor") ?? "").trim() || null
    if (formData.has("responsable_id"))
      updates.responsable_id =
        String(formData.get("responsable_id") ?? "").trim() || null
    if (formData.has("fecha_objetivo"))
      updates.fecha_objetivo =
        String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { error } = await supabase
      .from("nps_planes")
      .update(updates)
      .eq("id", planId)
    if (error) return { error: error.message }

    revalidatePath(NPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Eliminar plan (cascade borra avances; limpiamos archivos del bucket)
// ------------------------------------------------------------------
export async function eliminarPlanNps(
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("nps_planes")
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

    const { data: avs } = await supabase
      .from("nps_planes_avances")
      .select("archivo_path")
      .eq("plan_id", planId)
      .not("archivo_path", "is", null)
    const paths = ((avs ?? []) as Array<{ archivo_path: string | null }>)
      .map((a) => a.archivo_path)
      .filter((x): x is string => !!x)

    const { error } = await supabase
      .from("nps_planes")
      .delete()
      .eq("id", planId)
    if (error) return { error: error.message }

    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(NPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Avances (seguimiento + evidencia)
// ------------------------------------------------------------------
export async function listarAvancesPlanNps(
  planId: string,
): Promise<Result<NpsPlanAvance[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("nps_planes_avances")
      .select(
        "*, autor:profiles!nps_planes_avances_autor_id_fkey(id, nombre)",
      )
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const avances: NpsPlanAvance[] = (
      (data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante: (r.estado_resultante as EstadoNpsPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      }
    })
    return { data: avances }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los avances",
    }
  }
}

export async function agregarAvancePlanNps(
  planId: string,
  formData: FormData,
): Promise<Result<NpsPlanAvance>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("nps_planes")
      .select("estado, created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const planRow = plan as {
      estado: EstadoNpsPlan
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
    const file = formData.get("archivo") as File | null
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    const tieneArchivo = file && file instanceof File && file.size > 0

    let nuevoEstado: EstadoNpsPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoNpsPlan))
        return { error: "Estado inválido" }
      nuevoEstado = nuevoEstadoRaw as EstadoNpsPlan
    }

    if (!tieneArchivo && !comentario) {
      return { error: "Cargá un comentario o adjuntá un archivo de evidencia" }
    }

    let archivoPath: string | null = null
    let archivoNombre: string | null = null
    if (tieneArchivo) {
      const cleanName = cleanFileName(file.name)
      const path = `${planId}/v${Date.now()}-${cleanName}`
      const arrayBuffer = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }
      archivoPath = path
      archivoNombre = file.name
    }

    const { data: avance, error: errAv } = await supabase
      .from("nps_planes_avances")
      .insert({
        plan_id: planId,
        comentario,
        archivo_path: archivoPath,
        archivo_nombre: archivoNombre,
        archivo_mime: tieneArchivo ? file.type || null : null,
        archivo_bytes: tieneArchivo ? file.size : null,
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select(
        "*, autor:profiles!nps_planes_avances_autor_id_fkey(id, nombre)",
      )
      .single()

    if (errAv || !avance) {
      if (archivoPath) await supabase.storage.from(BUCKET).remove([archivoPath])
      return { error: errAv?.message ?? "No se pudo registrar el avance" }
    }

    if (nuevoEstado && nuevoEstado !== planRow.estado) {
      const { error: errUpd } = await supabase
        .from("nps_planes")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", planId)
      if (errUpd) {
        await supabase
          .from("nps_planes_avances")
          .delete()
          .eq("id", (avance as { id: string }).id)
        if (archivoPath)
          await supabase.storage.from(BUCKET).remove([archivoPath])
        return { error: errUpd.message }
      }
    }

    revalidatePath(NPS_PATH)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = avance as any
    return {
      data: {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante: (r.estado_resultante as EstadoNpsPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando el avance",
    }
  }
}

export async function eliminarAvancePlanNps(
  avanceId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!avanceId) return { error: "ID de avance inválido" }

    const { data: avance, error: errA } = await supabase
      .from("nps_planes_avances")
      .select("id, autor_id, archivo_path")
      .eq("id", avanceId)
      .single()
    if (errA || !avance) return { error: errA?.message ?? "Avance no encontrado" }
    const row = avance as {
      autor_id: string | null
      archivo_path: string | null
    }
    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const { error: errDel } = await supabase
      .from("nps_planes_avances")
      .delete()
      .eq("id", avanceId)
    if (errDel) return { error: errDel.message }

    if (row.archivo_path)
      await supabase.storage.from(BUCKET).remove([row.archivo_path])

    revalidatePath(NPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el avance",
    }
  }
}

export async function getAvanceNpsSignedUrl(
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
    return {
      error: err instanceof Error ? err.message : "Error generando URL",
    }
  }
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

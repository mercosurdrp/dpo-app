"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  ReporteSeguridadAdjunto,
  ReporteSeguridadConAutor,
  ReporteSeguridadDetalle,
  ReporteSeguridadPlan,
  ReporteSeguridadPlanConFoto,
  ReporteSeguridadTipo,
  ReporteSeguridadLocalidad,
  ReporteSeguridadArea,
  ReporteSeguridadPuesto,
} from "@/types/database"

const DASHBOARD_PATH = "/reportes-seguridad"
const BUCKET = "reportes-seguridad"

type Result<T> = { data: T } | { error: string }

// ===================================================
// Tipos de input
// ===================================================

interface ReporteSeguridadFilters {
  tipo?: ReporteSeguridadTipo
  localidad?: ReporteSeguridadLocalidad
  fecha_desde?: string
  fecha_hasta?: string
}

interface ReporteInput {
  tipo: ReporteSeguridadTipo
  fecha: string // YYYY-MM-DD
  hora?: string | null // HH:MM
  descripcion: string
  accion_tomada?: string | null
  lugar?: string | null
  localidad?: ReporteSeguridadLocalidad | null
  area?: ReporteSeguridadArea | null
  damnificado_nombre?: string | null
  damnificado_puesto?: ReporteSeguridadPuesto | null
  dentro_cd?: boolean | null
  sif?: boolean | null
  quien_que?: string | null
}

interface UploadedAdjunto {
  storage_path: string
  mime_type: string
  tamano_bytes: number
}

interface PlanInput {
  descripcion: string
  foto_path?: string | null
  fecha_planificada?: string | null // YYYY-MM-DD
}

function isAccidenteOIncidente(tipo: ReporteSeguridadTipo): boolean {
  return tipo === "accidente" || tipo === "incidente"
}

function normalizeReporteFields(input: ReporteInput) {
  const esAccIncid = isAccidenteOIncidente(input.tipo)
  return {
    tipo: input.tipo,
    fecha: input.fecha,
    hora: input.hora || null,
    descripcion: input.descripcion.trim(),
    accion_tomada: input.accion_tomada?.trim() || null,
    lugar: input.lugar?.trim() || null,
    localidad: input.localidad || null,
    area: input.area || null,
    damnificado_nombre: esAccIncid ? input.damnificado_nombre?.trim() || null : null,
    damnificado_puesto: esAccIncid ? input.damnificado_puesto || null : null,
    dentro_cd: esAccIncid ? input.dentro_cd ?? null : null,
    sif: esAccIncid ? input.sif ?? null : null,
    quien_que: !esAccIncid ? input.quien_que?.trim() || null : null,
  }
}

// ===================================================
// Lectura
// ===================================================

export async function getReportes(
  filters?: ReporteSeguridadFilters
): Promise<Result<ReporteSeguridadConAutor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("reportes_seguridad")
      .select("*, autor:profiles!reportes_seguridad_creado_por_fkey(id, nombre)")
      .order("created_at", { ascending: false })

    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.localidad) query = query.eq("localidad", filters.localidad)
    if (filters?.fecha_desde) query = query.gte("fecha", filters.fecha_desde)
    if (filters?.fecha_hasta) query = query.lte("fecha", filters.fecha_hasta)

    const { data, error } = await query
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: ReporteSeguridadConAutor[] = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      tipo: row.tipo,
      fecha: row.fecha,
      hora: row.hora,
      descripcion: row.descripcion,
      accion_tomada: row.accion_tomada,
      lugar: row.lugar,
      localidad: row.localidad,
      area: row.area,
      damnificado_nombre: row.damnificado_nombre,
      damnificado_puesto: row.damnificado_puesto,
      dentro_cd: row.dentro_cd,
      sif: row.sif,
      quien_que: row.quien_que,
      creado_por: row.creado_por,
      created_at: row.created_at,
      updated_at: row.updated_at,
      autor_nombre: row.autor?.nombre ?? "Desconocido",
    }))

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando reportes",
    }
  }
}

export async function getReporte(
  id: string
): Promise<Result<ReporteSeguridadDetalle>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: rep, error } = await supabase
      .from("reportes_seguridad")
      .select("*, autor:profiles!reportes_seguridad_creado_por_fkey(id, nombre)")
      .eq("id", id)
      .single()

    if (error || !rep) {
      return { error: error?.message ?? "Reporte no encontrado" }
    }

    const { data: adjs, error: errAdjs } = await supabase
      .from("reporte_seguridad_adjuntos")
      .select("*")
      .eq("reporte_id", id)
      .order("created_at", { ascending: true })

    if (errAdjs) return { error: errAdjs.message }

    const adjuntosConUrl = ((adjs ?? []) as ReporteSeguridadAdjunto[]).map((a) => {
      const { data: pub } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(a.storage_path)
      return { ...a, url: pub.publicUrl }
    })

    const { data: planRow } = await supabase
      .from("reporte_seguridad_planes")
      .select("*")
      .eq("reporte_id", id)
      .maybeSingle()

    let plan: ReporteSeguridadPlanConFoto | null = null
    if (planRow) {
      const p = planRow as ReporteSeguridadPlan
      const foto_url = p.foto_path
        ? supabase.storage.from(BUCKET).getPublicUrl(p.foto_path).data.publicUrl
        : null
      plan = { ...p, foto_url }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = rep as any
    const detalle: ReporteSeguridadDetalle = {
      id: row.id,
      tipo: row.tipo,
      fecha: row.fecha,
      hora: row.hora,
      descripcion: row.descripcion,
      accion_tomada: row.accion_tomada,
      lugar: row.lugar,
      localidad: row.localidad,
      area: row.area,
      damnificado_nombre: row.damnificado_nombre,
      damnificado_puesto: row.damnificado_puesto,
      dentro_cd: row.dentro_cd,
      sif: row.sif,
      quien_que: row.quien_que,
      creado_por: row.creado_por,
      created_at: row.created_at,
      updated_at: row.updated_at,
      autor_nombre: row.autor?.nombre ?? "Desconocido",
      adjuntos: adjuntosConUrl,
      plan,
    }

    return { data: detalle }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando reporte",
    }
  }
}

// ===================================================
// Crear / editar
// ===================================================

// Nota: los archivos se suben desde el cliente directo al bucket de Supabase
// para evitar el límite de body de Vercel en Server Actions. Acá sólo
// llegan los storage paths ya subidos.
export async function createReporte(
  input: ReporteInput,
  adjuntos: UploadedAdjunto[] = []
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!input.tipo) return { error: "Tipo es obligatorio" }
    if (!input.fecha) return { error: "Fecha es obligatoria" }
    if (!input.descripcion?.trim()) {
      return { error: "Descripción es obligatoria" }
    }

    const fields = normalizeReporteFields(input)

    const { data: inserted, error: errIns } = await supabase
      .from("reportes_seguridad")
      .insert({ ...fields, creado_por: profile.id })
      .select("id")
      .single()

    if (errIns || !inserted) {
      return { error: errIns?.message ?? "No se pudo crear el reporte" }
    }

    const reporteId = inserted.id as string

    if (adjuntos.length > 0) {
      const rows = adjuntos.map((a) => ({
        reporte_id: reporteId,
        storage_path: a.storage_path,
        mime_type: a.mime_type,
        "tamaño_bytes": a.tamano_bytes,
      }))
      const { error: errAdj } = await supabase
        .from("reporte_seguridad_adjuntos")
        .insert(rows)
      if (errAdj) {
        // Cleanup: borrar archivos y reporte
        await supabase.storage.from(BUCKET).remove(adjuntos.map((a) => a.storage_path))
        await supabase.from("reportes_seguridad").delete().eq("id", reporteId)
        return { error: `Error registrando adjuntos: ${errAdj.message}` }
      }
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id: reporteId } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando reporte",
    }
  }
}

export async function updateReporte(
  id: string,
  input: ReporteInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede editar reportes." }
    }
    const supabase = await createClient()

    if (!input.tipo) return { error: "Tipo es obligatorio" }
    if (!input.fecha) return { error: "Fecha es obligatoria" }
    if (!input.descripcion?.trim()) {
      return { error: "Descripción es obligatoria" }
    }

    const fields = normalizeReporteFields(input)

    const { error } = await supabase
      .from("reportes_seguridad")
      .update(fields)
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error editando reporte",
    }
  }
}

export async function deleteReporte(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede eliminar reportes." }
    }
    const supabase = await createClient()

    const { data: adjs } = await supabase
      .from("reporte_seguridad_adjuntos")
      .select("storage_path")
      .eq("reporte_id", id)

    const paths = ((adjs ?? []) as { storage_path: string }[]).map(
      (a) => a.storage_path
    )

    const { data: planRow } = await supabase
      .from("reporte_seguridad_planes")
      .select("foto_path")
      .eq("reporte_id", id)
      .maybeSingle()

    if (planRow?.foto_path) paths.push(planRow.foto_path)

    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    const { error } = await supabase.from("reportes_seguridad").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando reporte",
    }
  }
}

// ===================================================
// Plan de acción (1 por reporte, sólo admin)
// ===================================================

export async function upsertReportePlan(
  reporteId: string,
  input: PlanInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede gestionar el plan." }
    }
    if (!input.descripcion?.trim()) {
      return { error: "La descripción es obligatoria." }
    }
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("reporte_seguridad_planes")
      .select("id, foto_path")
      .eq("reporte_id", reporteId)
      .maybeSingle()

    const nextFotoPath =
      input.foto_path === undefined ? existing?.foto_path ?? null : input.foto_path

    // Si cambió la foto, borrar la anterior del bucket.
    if (
      existing?.foto_path &&
      input.foto_path !== undefined &&
      existing.foto_path !== input.foto_path
    ) {
      await supabase.storage.from(BUCKET).remove([existing.foto_path])
    }

    if (existing) {
      const { error } = await supabase
        .from("reporte_seguridad_planes")
        .update({
          descripcion: input.descripcion.trim(),
          foto_path: nextFotoPath,
          fecha_planificada: input.fecha_planificada || null,
        })
        .eq("id", existing.id)
      if (error) return { error: error.message }
      revalidatePath(DASHBOARD_PATH)
      return { data: { id: existing.id as string } }
    }

    const { data: inserted, error } = await supabase
      .from("reporte_seguridad_planes")
      .insert({
        reporte_id: reporteId,
        descripcion: input.descripcion.trim(),
        foto_path: nextFotoPath,
        fecha_planificada: input.fecha_planificada || null,
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (error || !inserted) {
      return { error: error?.message ?? "No se pudo crear el plan." }
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id: inserted.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error guardando plan",
    }
  }
}

export async function marcarReportePlanCompletado(
  reporteId: string,
  completado: boolean
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede completar el plan." }
    }
    const supabase = await createClient()

    const { error } = await supabase
      .from("reporte_seguridad_planes")
      .update({ fecha_completado: completado ? new Date().toISOString() : null })
      .eq("reporte_id", reporteId)

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando plan",
    }
  }
}

export async function deleteReportePlan(
  reporteId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede borrar el plan." }
    }
    const supabase = await createClient()

    const { data: plan } = await supabase
      .from("reporte_seguridad_planes")
      .select("foto_path")
      .eq("reporte_id", reporteId)
      .maybeSingle()

    if (plan?.foto_path) {
      await supabase.storage.from(BUCKET).remove([plan.foto_path])
    }

    const { error } = await supabase
      .from("reporte_seguridad_planes")
      .delete()
      .eq("reporte_id", reporteId)

    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando plan",
    }
  }
}

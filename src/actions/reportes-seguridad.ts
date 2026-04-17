"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  ReporteSeguridad,
  ReporteSeguridadAdjunto,
  ReporteSeguridadConAutor,
  ReporteSeguridadDetalle,
  ReporteSeguridadTipo,
  ReporteSeguridadLocalidad,
  ReporteSeguridadArea,
  ReporteSeguridadPuesto,
} from "@/types/database"

const DASHBOARD_PATH = "/reportes-seguridad"
const BUCKET = "reportes-seguridad"
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB por archivo

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

interface CreateReporteInput {
  tipo: ReporteSeguridadTipo
  fecha: string // YYYY-MM-DD
  hora?: string | null // HH:MM
  descripcion: string
  accion_tomada?: string | null
  lugar?: string | null
  localidad?: ReporteSeguridadLocalidad | null
  area?: ReporteSeguridadArea | null
  // accidente / incidente
  damnificado_nombre?: string | null
  damnificado_puesto?: ReporteSeguridadPuesto | null
  dentro_cd?: boolean | null
  sif?: boolean | null
  // acto_inseguro / ruta_riesgo / acto_seguro
  quien_que?: string | null
}

function isAccidenteOIncidente(tipo: ReporteSeguridadTipo): boolean {
  return tipo === "accidente" || tipo === "incidente"
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
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

    const adjuntosConUrl = await Promise.all(
      ((adjs ?? []) as ReporteSeguridadAdjunto[]).map(async (a) => {
        const { data: pub } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(a.storage_path)
        return { ...a, url: pub.publicUrl }
      })
    )

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
    }

    return { data: detalle }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando reporte",
    }
  }
}

// ===================================================
// Mutaciones
// ===================================================

/**
 * Crea un reporte con adjuntos. Los archivos llegan como FormData (para
 * sortear el límite de 4.5MB del body serializado en server actions sólo hay
 * que recordar que cada archivo está capeado a 10MB por UI; el bucket es
 * público así que sólo se guarda la ruta).
 *
 * El cliente debe armar un FormData con:
 *   - "input": JSON string con CreateReporteInput
 *   - "files": múltiples entries con los Files
 */
export async function createReporte(
  formData: FormData
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const inputRaw = formData.get("input")
    if (typeof inputRaw !== "string") {
      return { error: "Datos del reporte faltantes" }
    }
    let input: CreateReporteInput
    try {
      input = JSON.parse(inputRaw) as CreateReporteInput
    } catch {
      return { error: "Datos del reporte inválidos" }
    }

    if (!input.tipo) return { error: "Tipo es obligatorio" }
    if (!input.fecha) return { error: "Fecha es obligatoria" }
    if (!input.descripcion?.trim()) {
      return { error: "Descripción es obligatoria" }
    }

    const files = formData.getAll("files").filter(
      (f): f is File => f instanceof File && f.size > 0
    )

    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        return { error: `El archivo "${f.name}" supera los 10MB` }
      }
    }

    const esAccIncid = isAccidenteOIncidente(input.tipo)

    const { data: inserted, error: errIns } = await supabase
      .from("reportes_seguridad")
      .insert({
        tipo: input.tipo,
        fecha: input.fecha,
        hora: input.hora || null,
        descripcion: input.descripcion.trim(),
        accion_tomada: input.accion_tomada?.trim() || null,
        lugar: input.lugar?.trim() || null,
        localidad: input.localidad || null,
        area: input.area || null,
        damnificado_nombre: esAccIncid
          ? input.damnificado_nombre?.trim() || null
          : null,
        damnificado_puesto: esAccIncid ? input.damnificado_puesto || null : null,
        dentro_cd: esAccIncid ? input.dentro_cd ?? null : null,
        sif: esAccIncid ? input.sif ?? null : null,
        quien_que: !esAccIncid ? input.quien_que?.trim() || null : null,
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (errIns || !inserted) {
      return { error: errIns?.message ?? "No se pudo crear el reporte" }
    }

    const reporteId = inserted.id as string
    const uploadedPaths: string[] = []

    for (const file of files) {
      const safeName = sanitizeFileName(file.name || "archivo")
      const path = `${reporteId}/${crypto.randomUUID()}-${safeName}`
      const arrayBuffer = await file.arrayBuffer()
      const mime = file.type || "application/octet-stream"

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, { contentType: mime, upsert: false })

      if (upErr) {
        // Rollback: borrar archivos subidos + reporte
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(BUCKET).remove(uploadedPaths)
        }
        await supabase.from("reportes_seguridad").delete().eq("id", reporteId)
        return { error: `Error subiendo "${file.name}": ${upErr.message}` }
      }
      uploadedPaths.push(path)

      const { error: errAdj } = await supabase
        .from("reporte_seguridad_adjuntos")
        .insert({
          reporte_id: reporteId,
          storage_path: path,
          mime_type: mime,
          tamaño_bytes: file.size,
        })

      if (errAdj) {
        await supabase.storage.from(BUCKET).remove(uploadedPaths)
        await supabase.from("reportes_seguridad").delete().eq("id", reporteId)
        return { error: `Error registrando adjunto: ${errAdj.message}` }
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

export async function deleteReporte(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede eliminar reportes." }
    }
    const supabase = await createClient()

    // Limpiar adjuntos del bucket primero
    const { data: adjs } = await supabase
      .from("reporte_seguridad_adjuntos")
      .select("storage_path")
      .eq("reporte_id", id)

    const paths = ((adjs ?? []) as { storage_path: string }[]).map(
      (a) => a.storage_path
    )
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


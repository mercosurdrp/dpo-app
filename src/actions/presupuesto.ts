"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import {
  archivosDelForm,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"
import type {
  Profile,
  PresupuestoAnual,
  PresupuestoEerrAnual,
  PresupuestoTarea,
  PresupuestoTareaConResponsable,
  EstadoPresupuestoTarea,
} from "@/types/database"

const BUCKET = "presupuestos"
const REVALIDATE_PATH = "/presupuesto"

type Result<T> = { data: T } | { error: string }

// =============================================
// Helpers
// =============================================

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar el presupuesto")
  }
  return profile
}

function cleanFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function calcularDesvio(
  presup: number | null,
  real: number | null,
): number | null {
  if (presup === null || presup === 0) return null
  if (real === null) return null
  return ((real - presup) / presup) * 100
}

// Inserta una notificación in-app para el responsable asignado.
// Internal helper, no exportada como server action.
async function notificarAsignacion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  responsableId: string,
  tarea: { rubro: string },
): Promise<void> {
  try {
    await supabase.from("notificaciones").insert({
      user_id: responsableId,
      tipo: "presupuesto_tarea_asignada",
      titulo: `Nueva tarea de análisis: ${tarea.rubro}`,
      mensaje: "Te asignaron una tarea de análisis de presupuesto.",
      link: REVALIDATE_PATH,
    })
  } catch {
    // No bloquear la operación si la notificación falla.
  }
}

// =============================================
// Lectura
// =============================================

export async function getAniosDisponibles(): Promise<Result<number[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("presupuestos_anuales")
      .select("anio")
      .order("anio", { ascending: false })
    if (error) return { error: error.message }

    const anios = new Set<number>()
    for (const row of (data ?? []) as { anio: number }[]) {
      anios.add(row.anio)
    }
    anios.add(new Date().getFullYear())

    return {
      data: Array.from(anios).sort((a, b) => b - a),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando años",
    }
  }
}

export async function getPresupuestoAnual(
  anio: number,
): Promise<Result<PresupuestoAnual | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("presupuestos_anuales")
      .select("*")
      .eq("anio", anio)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data as PresupuestoAnual | null) ?? null }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando presupuesto anual",
    }
  }
}

export async function getEerrAnual(
  anio: number,
): Promise<Result<PresupuestoEerrAnual | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("presupuestos_eerr_anual")
      .select("*")
      .eq("anio", anio)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data as PresupuestoEerrAnual | null) ?? null }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando EERR anual",
    }
  }
}

export async function listTareas(
  anio: number,
): Promise<Result<PresupuestoTareaConResponsable[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("presupuestos_tareas")
      .select(
        "*, responsable:profiles!presupuestos_tareas_responsable_id_fkey(id, nombre, email)",
      )
      .eq("anio", anio)
      .order("mes", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) return { error: error.message }

    const enriched: PresupuestoTareaConResponsable[] = (data ?? []).map(
      (row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any
        const presup =
          r.monto_presupuestado !== null && r.monto_presupuestado !== undefined
            ? Number(r.monto_presupuestado)
            : null
        const real =
          r.monto_real !== null && r.monto_real !== undefined
            ? Number(r.monto_real)
            : null
        return {
          id: r.id,
          anio: r.anio,
          mes: r.mes,
          rubro: r.rubro,
          monto_presupuestado: presup,
          monto_real: real,
          descripcion: r.descripcion,
          responsable_id: r.responsable_id,
          fecha_limite: r.fecha_limite,
          estado: r.estado as EstadoPresupuestoTarea,
          evidencia_url: r.evidencia_url,
          evidencia_nombre: r.evidencia_nombre,
          evidencia_urls: (r.evidencia_urls as string[] | null) ?? [],
          evidencia_nombres: (r.evidencia_nombres as string[] | null) ?? [],
          justificacion: r.justificacion,
          completada_at: r.completada_at,
          created_by: r.created_by,
          created_at: r.created_at,
          updated_at: r.updated_at,
          responsable_nombre: r.responsable?.nombre ?? null,
          responsable_email: r.responsable?.email ?? null,
          desvio_pct: calcularDesvio(presup, real),
        }
      },
    )

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando tareas",
    }
  }
}

export async function getSignedUrl(
  archivoUrl: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(archivoUrl, 600)
    if (error || !data) {
      return { error: error?.message ?? "No se pudo firmar URL" }
    }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error firmando URL",
    }
  }
}

export async function listResponsablesPosibles(): Promise<
  Result<{ id: string; nombre: string; email: string }[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nombre, email")
      .eq("active", true)
      .order("nombre")
    if (error) return { error: error.message }
    return {
      data: (data ?? []) as { id: string; nombre: string; email: string }[],
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando usuarios",
    }
  }
}

export async function puedeEditarPresupuesto(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

// =============================================
// Mutaciones — archivos
// =============================================

export async function subirPresupuestoAnual(
  formData: FormData,
): Promise<Result<PresupuestoAnual>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const anioStr = String(formData.get("anio") ?? "").trim()
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null
    const file = formData.get("archivo") as File | null

    if (!anioStr) return { error: "El año es obligatorio" }
    const anio = parseInt(anioStr, 10)
    if (Number.isNaN(anio)) return { error: "Año inválido" }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Subí el archivo del presupuesto anual" }
    }

    // Buscar archivo existente para borrarlo
    const { data: actual } = await supabase
      .from("presupuestos_anuales")
      .select("archivo_url")
      .eq("anio", anio)
      .maybeSingle()

    const cleanName = cleanFileName(file.name)
    const path = `${anio}/anual-${Date.now()}-${cleanName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }

    const { data, error } = await supabase
      .from("presupuestos_anuales")
      .upsert(
        {
          anio,
          archivo_url: path,
          archivo_nombre: file.name,
          observaciones,
          created_by: profile.id,
        },
        { onConflict: "anio" },
      )
      .select("*")
      .single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error.message }
    }

    if (actual?.archivo_url && actual.archivo_url !== path) {
      await supabase.storage.from(BUCKET).remove([actual.archivo_url])
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as PresupuestoAnual }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error subiendo presupuesto anual",
    }
  }
}

export async function subirEerrAnual(
  formData: FormData,
): Promise<Result<PresupuestoEerrAnual>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const anioStr = String(formData.get("anio") ?? "").trim()
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null
    const file = formData.get("archivo") as File | null

    if (!anioStr) return { error: "El año es obligatorio" }
    const anio = parseInt(anioStr, 10)
    if (Number.isNaN(anio)) return { error: "Año inválido" }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Subí el archivo del Estado de Resultado" }
    }

    const { data: actual } = await supabase
      .from("presupuestos_eerr_anual")
      .select("archivo_url")
      .eq("anio", anio)
      .maybeSingle()

    const cleanName = cleanFileName(file.name)
    const path = `${anio}/eerr-${Date.now()}-${cleanName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }

    const { data, error } = await supabase
      .from("presupuestos_eerr_anual")
      .upsert(
        {
          anio,
          archivo_url: path,
          archivo_nombre: file.name,
          observaciones,
          created_by: profile.id,
        },
        { onConflict: "anio" },
      )
      .select("*")
      .single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error.message }
    }

    if (actual?.archivo_url && actual.archivo_url !== path) {
      await supabase.storage.from(BUCKET).remove([actual.archivo_url])
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as PresupuestoEerrAnual }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error subiendo EERR anual",
    }
  }
}

export async function eliminarEerrAnual(
  anio: number,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("presupuestos_eerr_anual")
      .select("archivo_url")
      .eq("anio", anio)
      .maybeSingle()

    const { error } = await supabase
      .from("presupuestos_eerr_anual")
      .delete()
      .eq("anio", anio)

    if (error) return { error: error.message }

    if (actual?.archivo_url) {
      await supabase.storage.from(BUCKET).remove([actual.archivo_url])
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error eliminando EERR anual",
    }
  }
}

// =============================================
// Mutaciones — tareas
// =============================================

export async function crearTarea(
  formData: FormData,
): Promise<Result<PresupuestoTarea>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const anioStr = String(formData.get("anio") ?? "").trim()
    const mesStr = String(formData.get("mes") ?? "").trim()
    const rubro = String(formData.get("rubro") ?? "").trim()
    const montoPresupStr = String(
      formData.get("monto_presupuestado") ?? "",
    ).trim()
    const montoRealStr = String(formData.get("monto_real") ?? "").trim()
    const descripcion =
      String(formData.get("descripcion") ?? "").trim() || null
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fecha_limite =
      String(formData.get("fecha_limite") ?? "").trim() || null

    if (!anioStr) return { error: "El año es obligatorio" }
    if (!mesStr) return { error: "El mes es obligatorio" }
    if (!rubro) return { error: "El rubro es obligatorio" }

    const anio = parseInt(anioStr, 10)
    const mes = parseInt(mesStr, 10)
    if (Number.isNaN(anio)) return { error: "Año inválido" }
    if (Number.isNaN(mes) || mes < 1 || mes > 12) {
      return { error: "Mes inválido (debe ser 1-12)" }
    }

    let monto_presupuestado: number | null = null
    if (montoPresupStr) {
      const v = Number(montoPresupStr)
      if (Number.isNaN(v)) return { error: "Monto presupuestado inválido" }
      monto_presupuestado = v
    }

    let monto_real: number | null = null
    if (montoRealStr) {
      const v = Number(montoRealStr)
      if (Number.isNaN(v)) return { error: "Monto real inválido" }
      monto_real = v
    }

    const { data, error } = await supabase
      .from("presupuestos_tareas")
      .insert({
        anio,
        mes,
        rubro,
        monto_presupuestado,
        monto_real,
        descripcion,
        responsable_id,
        fecha_limite,
        estado: "pendiente",
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    if (responsable_id) {
      await notificarAsignacion(supabase, responsable_id, { rubro })
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as PresupuestoTarea }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando tarea",
    }
  }
}

export async function actualizarTarea(
  id: string,
  formData: FormData,
): Promise<Result<PresupuestoTarea>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de tarea inválido" }

    const { data: actual, error: errActual } = await supabase
      .from("presupuestos_tareas")
      .select("responsable_id, rubro")
      .eq("id", id)
      .single()
    if (errActual) return { error: errActual.message }

    const anioStr = String(formData.get("anio") ?? "").trim()
    const mesStr = String(formData.get("mes") ?? "").trim()
    const rubro = String(formData.get("rubro") ?? "").trim()
    const montoPresupStr = String(
      formData.get("monto_presupuestado") ?? "",
    ).trim()
    const montoRealStr = String(formData.get("monto_real") ?? "").trim()
    const descripcion =
      String(formData.get("descripcion") ?? "").trim() || null
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fecha_limite =
      String(formData.get("fecha_limite") ?? "").trim() || null
    const estadoRaw = String(formData.get("estado") ?? "").trim()

    if (!anioStr) return { error: "El año es obligatorio" }
    if (!mesStr) return { error: "El mes es obligatorio" }
    if (!rubro) return { error: "El rubro es obligatorio" }

    const anio = parseInt(anioStr, 10)
    const mes = parseInt(mesStr, 10)
    if (Number.isNaN(anio)) return { error: "Año inválido" }
    if (Number.isNaN(mes) || mes < 1 || mes > 12) {
      return { error: "Mes inválido (debe ser 1-12)" }
    }

    let monto_presupuestado: number | null = null
    if (montoPresupStr) {
      const v = Number(montoPresupStr)
      if (Number.isNaN(v)) return { error: "Monto presupuestado inválido" }
      monto_presupuestado = v
    }

    let monto_real: number | null = null
    if (montoRealStr) {
      const v = Number(montoRealStr)
      if (Number.isNaN(v)) return { error: "Monto real inválido" }
      monto_real = v
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      anio,
      mes,
      rubro,
      monto_presupuestado,
      monto_real,
      descripcion,
      responsable_id,
      fecha_limite,
    }

    if (
      estadoRaw &&
      ["pendiente", "en_progreso", "completada"].includes(estadoRaw)
    ) {
      update.estado = estadoRaw
    }

    // Editores pueden corregir la justificación desde el form de edición,
    // incluso en tareas ya completadas (solo se toca si el form la envía).
    if (formData.has("justificacion")) {
      update.justificacion =
        String(formData.get("justificacion") ?? "").trim() || null
    }

    const { data, error } = await supabase
      .from("presupuestos_tareas")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    // Si cambió el responsable a uno nuevo, notificarlo
    const responsableAnterior = actual?.responsable_id ?? null
    if (
      responsable_id &&
      responsable_id !== responsableAnterior
    ) {
      await notificarAsignacion(supabase, responsable_id, { rubro })
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as PresupuestoTarea }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando tarea",
    }
  }
}

export async function responderTarea(
  id: string,
  formData: FormData,
): Promise<Result<PresupuestoTarea>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!id) return { error: "ID de tarea inválido" }

    const isEditor = ["admin", "supervisor", "admin_rrhh"].includes(
      profile.role,
    )

    const { data: actual, error: errActual } = await supabase
      .from("presupuestos_tareas")
      .select(
        "evidencia_url, evidencia_nombre, evidencia_urls, evidencia_nombres, responsable_id",
      )
      .eq("id", id)
      .single()
    if (errActual) return { error: errActual.message }

    if (!isEditor && actual.responsable_id !== profile.id) {
      return {
        error:
          "Solo el responsable o un editor puede responder esta tarea",
      }
    }

    const justificacionRaw = String(
      formData.get("justificacion") ?? "",
    ).trim()
    const justificacion = justificacionRaw || null
    const files = archivosDelForm(formData)
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()

    const tieneArchivo = files.length > 0

    if (!tieneArchivo && !justificacion) {
      return {
        error: "Subí evidencia o escribí una justificación",
      }
    }

    let nuevoEstado: EstadoPresupuestoTarea | null = null
    if (nuevoEstadoRaw) {
      if (!["en_progreso", "completada"].includes(nuevoEstadoRaw)) {
        return { error: "Estado inválido" }
      }
      nuevoEstado = nuevoEstadoRaw as EstadoPresupuestoTarea
    }

    let nuevos: ArchivoAvance[] = []
    if (tieneArchivo) {
      const subida = await subirArchivosAvance(
        supabase,
        BUCKET,
        `tareas/${id}`,
        files,
      )
      if ("error" in subida) return { error: subida.error }
      nuevos = subida.archivos
    }
    const nuevosPaths = nuevos.map((a) => a.path)

    // Las evidencias se ACUMULAN: responder de nuevo no borra las anteriores.
    // Fallback a la columna singular para tareas viejas sin backfillear.
    const urlsPrevias: string[] =
      (actual?.evidencia_urls as string[] | null)?.length
        ? (actual.evidencia_urls as string[])
        : actual?.evidencia_url
          ? [actual.evidencia_url as string]
          : []
    const nombresPrevios: string[] =
      (actual?.evidencia_nombres as string[] | null)?.length
        ? (actual.evidencia_nombres as string[])
        : actual?.evidencia_url
          ? [(actual.evidencia_nombre as string | null) ?? "Archivo"]
          : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {}
    if (justificacion !== null) {
      update.justificacion = justificacion
    }
    if (nuevos.length > 0) {
      const urls = [...urlsPrevias, ...nuevosPaths]
      const nombres = [...nombresPrevios, ...nuevos.map((a) => a.nombre)]
      update.evidencia_urls = urls
      update.evidencia_nombres = nombres
      // Las singulares apuntan al PRIMER archivo (lectores viejos).
      update.evidencia_url = urls[0] ?? null
      update.evidencia_nombre = nombres[0] ?? null
    }
    if (nuevoEstado) {
      update.estado = nuevoEstado
      if (nuevoEstado === "completada") {
        update.completada_at = new Date().toISOString()
      } else {
        // Reabrir: limpiar la marca de cierre para mantener consistencia
        update.completada_at = null
      }
    }

    const { data, error } = await supabase
      .from("presupuestos_tareas")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (nuevosPaths.length) {
        await supabase.storage.from(BUCKET).remove(nuevosPaths)
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as PresupuestoTarea }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error respondiendo tarea",
    }
  }
}

export async function eliminarTarea(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    if (!id) return { error: "ID de tarea inválido" }

    const { data: actual } = await supabase
      .from("presupuestos_tareas")
      .select("evidencia_url, evidencia_urls")
      .eq("id", id)
      .maybeSingle()

    const { error } = await supabase
      .from("presupuestos_tareas")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    // Todas las evidencias de la tarea (las viejas solo tienen la singular).
    const paths = new Set<string>()
    for (const p of (actual?.evidencia_urls as string[] | null) ?? []) {
      if (p) paths.add(p)
    }
    if (actual?.evidencia_url) paths.add(actual.evidencia_url as string)
    if (paths.size > 0) {
      await supabase.storage.from(BUCKET).remove([...paths])
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando tarea",
    }
  }
}

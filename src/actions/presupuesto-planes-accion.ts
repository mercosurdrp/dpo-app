"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import type {
  Profile,
  EstadoPlanAccion,
  EstadoPasoPlanAccion,
  PlanAccionPresupuestoConDetalle,
  PlanAccionPaso,
} from "@/types/database"

const REVALIDATE_PATH = "/presupuesto"
const BUCKET = "planes-accion-presupuesto"

type Result<T> = { data: T } | { error: string }

const ESTADOS_PLAN_VALIDOS: EstadoPlanAccion[] = [
  "abierto",
  "en_progreso",
  "cerrado",
  "cancelado",
]

const ESTADOS_PASO_VALIDOS: EstadoPasoPlanAccion[] = [
  "pendiente",
  "en_progreso",
  "completado",
]

// =============================================
// Helpers
// =============================================

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar planes de acción")
  }
  return profile
}

function parseNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim()
  if (s === "") return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

function parseText(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return s === "" ? null : s
}

function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80)
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/** Sube los archivos "adjuntos" del FormData al bucket y devuelve sus URLs públicas. */
async function subirAdjuntos(
  supabase: SupabaseServerClient,
  formData: FormData,
): Promise<Result<{ urls: string[]; paths: string[] }>> {
  const files = formData
    .getAll("adjuntos")
    .filter((f): f is File => f instanceof File && f.size > 0)
  const urls: string[] = []
  const paths: string[] = []
  for (const file of files) {
    const path = `${Date.now()}-${cleanFileName(file.name)}`
    const buffer = await file.arrayBuffer()
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
    if (error) {
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      return { error: `Subiendo adjunto: ${error.message}` }
    }
    paths.push(path)
    urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
  }
  return { data: { urls, paths } }
}

function pathsDesdeUrls(urls: string[]): string[] {
  return urls.map((u) => u.split(`/${BUCKET}/`)[1]).filter(Boolean) as string[]
}

export async function puedeEditarPlanesAccion(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

// =============================================
// Lectura
// =============================================

export async function listPlanesAccion(
  anio: number,
): Promise<Result<PlanAccionPresupuestoConDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("presupuestos_planes_accion")
      .select(
        "*, responsable:profiles!presupuestos_planes_accion_responsable_id_fkey(id, nombre, email), tarea:presupuestos_tareas!presupuestos_planes_accion_tarea_id_fkey(id, rubro, mes), pasos:presupuestos_planes_accion_pasos(*, responsable:profiles!presupuestos_planes_accion_pasos_responsable_id_fkey(id, nombre))",
      )
      .eq("anio", anio)
      .order("created_at", { ascending: true })

    if (error) return { error: error.message }

    const enriched: PlanAccionPresupuestoConDetalle[] = (data ?? []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const pasos: PlanAccionPaso[] = (r.pasos ?? [])
        .map((p: Record<string, unknown>) => ({
          id: p.id as string,
          plan_id: p.plan_id as string,
          orden: (p.orden as number) ?? 0,
          que: p.que as string,
          como: (p.como as string) ?? null,
          responsable_id: (p.responsable_id as string) ?? null,
          fecha_limite: (p.fecha_limite as string) ?? null,
          estado: p.estado as EstadoPasoPlanAccion,
          avance: (p.avance as string) ?? null,
          created_by: (p.created_by as string) ?? null,
          created_at: p.created_at as string,
          updated_at: p.updated_at as string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responsable_nombre: (p.responsable as any)?.nombre ?? null,
        }))
        .sort((a: PlanAccionPaso, b: PlanAccionPaso) => {
          if (a.orden !== b.orden) return a.orden - b.orden
          return a.created_at.localeCompare(b.created_at)
        })

      return {
        id: r.id,
        anio: r.anio,
        tarea_id: r.tarea_id,
        titulo: r.titulo,
        desvio_detectado: r.desvio_detectado,
        causa_raiz: r.causa_raiz,
        responsable_id: r.responsable_id,
        fecha_limite: r.fecha_limite,
        estado: r.estado as EstadoPlanAccion,
        observaciones: r.observaciones,
        adjunto_urls: (r.adjunto_urls as string[] | null) ?? [],
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        responsable_nombre: r.responsable?.nombre ?? null,
        responsable_email: r.responsable?.email ?? null,
        tarea_rubro: r.tarea?.rubro ?? null,
        tarea_mes: r.tarea?.mes ?? null,
        pasos,
      }
    })

    return { data: enriched }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando planes de acción",
    }
  }
}

// =============================================
// Mutaciones — plan (cabecera)
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function camposPlanDesdeForm(formData: FormData): Record<string, any> {
  const estadoRaw = String(formData.get("estado") ?? "").trim()
  const estado: EstadoPlanAccion = ESTADOS_PLAN_VALIDOS.includes(
    estadoRaw as EstadoPlanAccion,
  )
    ? (estadoRaw as EstadoPlanAccion)
    : "abierto"

  return {
    tarea_id: parseText(formData.get("tarea_id")),
    titulo: String(formData.get("titulo") ?? "").trim(),
    desvio_detectado: parseText(formData.get("desvio_detectado")),
    causa_raiz: parseText(formData.get("causa_raiz")),
    responsable_id: parseText(formData.get("responsable_id")),
    fecha_limite: parseText(formData.get("fecha_limite")),
    estado,
    observaciones: parseText(formData.get("observaciones")),
  }
}

export async function crearPlanAccion(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const anio = parseNum(formData.get("anio"))
    if (anio === null) return { error: "El año es obligatorio" }

    const campos = camposPlanDesdeForm(formData)
    if (!campos.titulo) return { error: "El título es obligatorio" }

    const subida = await subirAdjuntos(supabase, formData)
    if ("error" in subida) return { error: subida.error }

    const { data, error } = await supabase
      .from("presupuestos_planes_accion")
      .insert({
        anio,
        ...campos,
        adjunto_urls: subida.data.urls,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error) {
      if (subida.data.paths.length)
        await supabase.storage.from(BUCKET).remove(subida.data.paths)
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando plan de acción",
    }
  }
}

export async function actualizarPlanAccion(
  id: string,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const campos = camposPlanDesdeForm(formData)
    if (!campos.titulo) return { error: "El título es obligatorio" }

    // Adjuntos: los existentes que el usuario conservó + los nuevos subidos.
    const { data: actual } = await supabase
      .from("presupuestos_planes_accion")
      .select("adjunto_urls")
      .eq("id", id)
      .single()
    const previas = ((actual?.adjunto_urls as string[] | null) ?? [])

    let conservadas = previas
    const existentesRaw = formData.get("adjuntos_existentes")
    if (typeof existentesRaw === "string") {
      try {
        const parsed = JSON.parse(existentesRaw)
        if (Array.isArray(parsed))
          conservadas = previas.filter((u) => parsed.includes(u))
      } catch {
        // si no parsea, conservar todo
      }
    }

    const subida = await subirAdjuntos(supabase, formData)
    if ("error" in subida) return { error: subida.error }

    const { error } = await supabase
      .from("presupuestos_planes_accion")
      .update({ ...campos, adjunto_urls: [...conservadas, ...subida.data.urls] })
      .eq("id", id)

    if (error) {
      if (subida.data.paths.length)
        await supabase.storage.from(BUCKET).remove(subida.data.paths)
      return { error: error.message }
    }

    // Borrar del bucket los adjuntos que el usuario quitó.
    const removidas = pathsDesdeUrls(previas.filter((u) => !conservadas.includes(u)))
    if (removidas.length) await supabase.storage.from(BUCKET).remove(removidas)

    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando plan de acción",
    }
  }
}

export async function eliminarPlanAccion(
  id: string,
): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("presupuestos_planes_accion")
      .select("adjunto_urls")
      .eq("id", id)
      .single()

    // Los pasos caen por CASCADE
    const { error } = await supabase
      .from("presupuestos_planes_accion")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    const paths = pathsDesdeUrls((actual?.adjunto_urls as string[] | null) ?? [])
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error eliminando plan de acción",
    }
  }
}

// =============================================
// Mutaciones — pasos / acciones
// =============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function camposPasoDesdeForm(formData: FormData): Record<string, any> {
  const estadoRaw = String(formData.get("estado") ?? "").trim()
  const estado: EstadoPasoPlanAccion = ESTADOS_PASO_VALIDOS.includes(
    estadoRaw as EstadoPasoPlanAccion,
  )
    ? (estadoRaw as EstadoPasoPlanAccion)
    : "pendiente"

  return {
    que: String(formData.get("que") ?? "").trim(),
    como: parseText(formData.get("como")),
    responsable_id: parseText(formData.get("responsable_id")),
    fecha_limite: parseText(formData.get("fecha_limite")),
    estado,
    avance: parseText(formData.get("avance")),
    orden: parseNum(formData.get("orden")) ?? 0,
  }
}

export async function crearPaso(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const planId = String(formData.get("plan_id") ?? "").trim()
    if (!planId) return { error: "Falta el plan" }

    const campos = camposPasoDesdeForm(formData)
    if (!campos.que) return { error: "La acción (qué) es obligatoria" }

    const { data, error } = await supabase
      .from("presupuestos_planes_accion_pasos")
      .insert({ plan_id: planId, ...campos, created_by: profile.id })
      .select("id")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando la acción",
    }
  }
}

export async function actualizarPaso(
  id: string,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const campos = camposPasoDesdeForm(formData)
    if (!campos.que) return { error: "La acción (qué) es obligatoria" }

    const { error } = await supabase
      .from("presupuestos_planes_accion_pasos")
      .update(campos)
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando la acción",
    }
  }
}

export async function eliminarPaso(
  id: string,
): Promise<Result<{ ok: true }>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { error } = await supabase
      .from("presupuestos_planes_accion_pasos")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando la acción",
    }
  }
}

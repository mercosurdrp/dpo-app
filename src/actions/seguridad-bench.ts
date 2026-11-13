"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

// Reporte Bench de Seguridad: una investigación de seguridad de OTRO
// distribuidor por día, que se trabaja en la Etapa 1 de las reuniones y se
// vuelca a Entrega y Almacén. Archivo en el bucket privado "reuniones".
const BUCKET = "reuniones"
const TABLE = "seguridad_bench_reportes"
const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]
const MAX_BYTES = 20 * 1024 * 1024

export interface BenchSeguridad {
  id: string
  fecha: string
  titulo: string
  distribuidor: string | null
  clasificacion: string | null
  resumen: string | null
  archivo_nombre: string | null
  archivo_tipo: string | null
  url: string | null
  aprendizaje_entrega: string | null
  aprendizaje_almacen: string | null
  created_at: string
  updated_at: string
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Sólo editores de reuniones pueden cargar el bench de seguridad")
  }
  return profile
}

function cleanName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

function texto(v: FormDataEntryValue | null, max = 4000): string | null {
  const s = String(v ?? "").trim()
  return s ? s.slice(0, max) : null
}

const COLS =
  "id, fecha, titulo, distribuidor, clasificacion, resumen, archivo_path, archivo_nombre, archivo_tipo, aprendizaje_entrega, aprendizaje_almacen, created_at, updated_at"

/**
 * Bench de la fecha de la reunión (o el último anterior si ese día no se
 * cargó) + historial reciente para elegir otro.
 */
export async function getBenchSeguridad(
  fechaHasta: string,
): Promise<Result<BenchSeguridad[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLS)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30)
    if (error) {
      // Tabla todavía no creada en esta base (migración pendiente).
      if (error.code === "PGRST205" || error.code === "42P01") {
        return { error: "El bench de seguridad todavía no está habilitado en esta base." }
      }
      return { error: error.message }
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>
    const paths = rows.map((r) => r.archivo_path as string)
    const urls = new Map<string, string>()
    if (paths.length) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 3600)
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
      }
    }
    return {
      data: rows.map((r) => ({
        id: r.id as string,
        fecha: r.fecha as string,
        titulo: r.titulo as string,
        distribuidor: (r.distribuidor as string | null) ?? null,
        clasificacion: (r.clasificacion as string | null) ?? null,
        resumen: (r.resumen as string | null) ?? null,
        archivo_nombre: (r.archivo_nombre as string | null) ?? null,
        archivo_tipo: (r.archivo_tipo as string | null) ?? null,
        url: urls.get(r.archivo_path as string) ?? null,
        aprendizaje_entrega: (r.aprendizaje_entrega as string | null) ?? null,
        aprendizaje_almacen: (r.aprendizaje_almacen as string | null) ?? null,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      })),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el bench de seguridad",
    }
  }
}

/** Adjunta la investigación del día (PDF o imagen). */
export async function adjuntarBenchSeguridad(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const fecha = String(formData.get("fecha") ?? "").trim()
    const titulo = texto(formData.get("titulo"), 200)
    const file = formData.get("archivo")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Fecha inválida" }
    if (!titulo) return { error: "Poné un título a la investigación" }
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Adjuntá el archivo de la investigación" }
    }
    const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    if (!esPdf && !file.type.startsWith("image/")) {
      return { error: "El archivo tiene que ser PDF o imagen" }
    }
    if (file.size > MAX_BYTES) return { error: "El archivo supera los 20 MB" }

    const contentType = esPdf ? "application/pdf" : file.type
    const path = `bench-seguridad/${fecha}/${Date.now()}-${cleanName(file.name)}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType, upsert: false })
    if (upErr) return { error: `Subiendo el archivo: ${upErr.message}` }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        fecha,
        titulo,
        distribuidor: texto(formData.get("distribuidor"), 200),
        clasificacion: texto(formData.get("clasificacion"), 100),
        resumen: texto(formData.get("resumen")),
        archivo_path: path,
        archivo_nombre: file.name,
        archivo_tipo: contentType,
        creado_por: profile.id,
      })
      .select("id")
      .single()
    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error?.message ?? "No se pudo guardar la investigación" }
    }
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error adjuntando la investigación",
    }
  }
}

/** Guarda lo trabajado en la reunión: qué se vuelca a Entrega y a Almacén. */
export async function guardarAprendizajesBench(input: {
  id: string
  aprendizaje_entrega: string | null
  aprendizaje_almacen: string | null
}): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const limpio = (s: string | null) => {
      const t = (s ?? "").trim()
      return t ? t.slice(0, 4000) : null
    }
    const { error } = await supabase
      .from(TABLE)
      .update({
        aprendizaje_entrega: limpio(input.aprendizaje_entrega),
        aprendizaje_almacen: limpio(input.aprendizaje_almacen),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando" }
  }
}

export async function eliminarBenchSeguridad(id: string): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data: row } = await supabase
      .from(TABLE)
      .select("archivo_path")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase.from(TABLE).delete().eq("id", id)
    if (error) return { error: error.message }
    const path = (row as { archivo_path?: string } | null)?.archivo_path
    if (path) await supabase.storage.from(BUCKET).remove([path])
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando" }
  }
}

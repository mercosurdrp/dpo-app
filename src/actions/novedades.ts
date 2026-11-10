"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth, requireRole } from "@/lib/session"
import { NOVEDADES_BUCKET, NOVEDAD_IMAGEN_MAX_BYTES, type Novedad } from "@/lib/novedades"

type Result<T> = { data: T } | { error: string }

/** Fecha de hoy en Argentina (YYYY-MM-DD). */
function hoyArg(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapear(supabase: any, row: any): Novedad {
  const url = row.imagen_path
    ? (supabase.storage.from(NOVEDADES_BUCKET).getPublicUrl(row.imagen_path).data.publicUrl as string)
    : null
  return {
    id: row.id,
    titulo: row.titulo,
    texto: row.texto ?? null,
    imagen_url: url,
    vigente_hasta: row.vigente_hasta ?? null,
    fijada: !!row.fijada,
    created_at: row.created_at,
    autor: row.autor?.nombre ?? null,
  }
}

const SELECT = "*, autor:profiles!novedades_creado_por_fkey(nombre)"

/** Las que se ven hoy en el Inicio del empleado: fijadas primero, después las más nuevas. */
export async function getNovedadesVigentes(): Promise<Result<Novedad[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("novedades")
      .select(SELECT)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoyArg()}`)
      .order("fijada", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) {
      // 42P01: la tabla todavía no existe (migración sin aplicar) → cartelera vacía.
      if (error.code === "42P01") return { data: [] }
      return { error: error.message }
    }
    return { data: (data ?? []).map((r) => mapear(supabase, r)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando novedades" }
  }
}

/** Todas (también las vencidas), para la página de gestión. */
export async function getNovedadesTodas(): Promise<Result<Novedad[]>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("novedades")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) return { error: error.message }
    return { data: (data ?? []).map((r) => mapear(supabase, r)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando novedades" }
  }
}

export async function crearNovedad(formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const titulo = String(formData.get("titulo") ?? "").trim()
    const texto = String(formData.get("texto") ?? "").trim() || null
    const vigenteHasta = String(formData.get("vigente_hasta") ?? "").trim() || null
    const fijada = formData.get("fijada") === "true"
    const imagen = formData.get("imagen")
    if (!titulo) return { error: "El título es obligatorio." }
    const archivo = imagen instanceof File && imagen.size > 0 ? imagen : null
    if (!archivo && !texto) return { error: "Subí una imagen o escribí un texto." }
    if (archivo && !archivo.type.startsWith("image/")) return { error: "El archivo tiene que ser una imagen." }
    if (archivo && archivo.size > NOVEDAD_IMAGEN_MAX_BYTES) return { error: "La imagen pesa más de 4 MB." }

    const admin = createAdminClient()
    let imagenPath: string | null = null
    if (archivo) {
      const limpio = archivo.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-60)
      imagenPath = `${Date.now()}-${limpio}`
      const { error: upErr } = await admin.storage
        .from(NOVEDADES_BUCKET)
        .upload(imagenPath, await archivo.arrayBuffer(), { contentType: archivo.type, upsert: false })
      if (upErr) return { error: `Subiendo la imagen: ${upErr.message}` }
    }
    const { data, error } = await admin
      .from("novedades")
      .insert({ titulo, texto, imagen_path: imagenPath, vigente_hasta: vigenteHasta, fijada, creado_por: profile.id })
      .select("id")
      .single()
    if (error || !data) {
      if (imagenPath) await admin.storage.from(NOVEDADES_BUCKET).remove([imagenPath])
      return { error: error?.message ?? "No se pudo publicar." }
    }
    revalidatePath("/novedades")
    revalidatePath("/mis-capacitaciones")
    return { data: { id: data.id as string } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error publicando la novedad" }
  }
}

export async function borrarNovedad(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const admin = createAdminClient()
    const { data: row } = await admin.from("novedades").select("imagen_path").eq("id", id).maybeSingle()
    const { error } = await admin.from("novedades").delete().eq("id", id)
    if (error) return { error: error.message }
    if (row?.imagen_path) await admin.storage.from(NOVEDADES_BUCKET).remove([row.imagen_path as string])
    revalidatePath("/novedades")
    revalidatePath("/mis-capacitaciones")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error borrando la novedad" }
  }
}

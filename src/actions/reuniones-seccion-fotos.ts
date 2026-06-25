"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

const BUCKET = "reuniones"
const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]
const TABLE = "reunion_seccion_fotos"

export interface SeccionFoto {
  id: string
  reunion_id: string
  seccion: string
  descripcion: string | null
  foto_nombre: string | null
  url: string | null
  created_at: string
}

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo editores pueden gestionar las fotos de la sección")
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

function cleanSeccion(seccion: string): string {
  return seccion.trim().replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60)
}

export async function getSeccionFotos(
  reunionId: string,
  seccion: string,
): Promise<Result<SeccionFoto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, reunion_id, seccion, descripcion, foto_nombre, foto_path, created_at")
      .eq("reunion_id", reunionId)
      .eq("seccion", cleanSeccion(seccion))
      .order("created_at", { ascending: true })
    if (error) return { error: error.message }

    const out: SeccionFoto[] = []
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const path = r.foto_path as string
      const signed = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)
      out.push({
        id: r.id as string,
        reunion_id: r.reunion_id as string,
        seccion: r.seccion as string,
        descripcion: (r.descripcion as string | null) ?? null,
        foto_nombre: (r.foto_nombre as string | null) ?? null,
        url: signed.data?.signedUrl ?? null,
        created_at: r.created_at as string,
      })
    }
    return { data: out }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando las fotos de la sección",
    }
  }
}

// Sube una imagen al bucket y registra la fila. Lanza Error en caso de fallo.
async function uploadOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  reunion_id: string,
  seccion: string,
  descripcion: string | null,
  file: File,
  index = 0,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`"${file.name}" no es una imagen`)
  }
  const path = `seccion-fotos/${seccion}/${reunion_id}/${Date.now()}-${index}-${cleanName(file.name)}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    })
  if (upErr) throw new Error(`Subiendo "${file.name}": ${upErr.message}`)

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      reunion_id,
      seccion,
      foto_path: path,
      foto_nombre: file.name,
      descripcion,
      creado_por: profileId,
    })
    .select("id")
    .single()

  if (error || !data) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(error?.message ?? `No se pudo guardar "${file.name}"`)
  }
  return (data as { id: string }).id
}

// Sube una o varias fotos en una sola llamada (key "fotos"). La descripción, si
// se pasa, se aplica a todas. Devuelve cuántas se subieron y los errores parciales.
export async function subirSeccionFotos(
  formData: FormData,
): Promise<Result<{ subidas: number; errores: string[] }>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const seccion = cleanSeccion(String(formData.get("seccion") ?? ""))
    const descripcion = String(formData.get("descripcion") ?? "").trim() || null
    const files = formData
      .getAll("fotos")
      .filter((f): f is File => f instanceof File && f.size > 0)

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!seccion) return { error: "La sección es obligatoria" }
    if (files.length === 0) return { error: "Subí al menos una imagen" }

    let subidas = 0
    const errores: string[] = []
    // Secuencial: mantiene el orden y no satura el bucket.
    for (let i = 0; i < files.length; i++) {
      try {
        await uploadOne(supabase, profile.id, reunion_id, seccion, descripcion, files[i], i)
        subidas++
      } catch (e) {
        errores.push(e instanceof Error ? e.message : `Falló "${files[i].name}"`)
      }
    }

    if (subidas === 0) {
      return { error: errores[0] ?? "No se pudo subir ninguna imagen" }
    }
    return { data: { subidas, errores } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo las imágenes",
    }
  }
}

// Sube una imagen YA GENERADA en el server (p. ej. la captura automática del
// día de RMD/NPS) al mismo bucket/galería que las fotos manuales.
export async function subirImagenGenerada(
  reunionId: string,
  seccion: string,
  nombreArchivo: string,
  descripcion: string | null,
  bytes: Uint8Array,
  contentType = "image/png",
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()

    const sec = cleanSeccion(seccion)
    const reunion_id = reunionId.trim()
    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!sec) return { error: "La sección es obligatoria" }

    const path = `seccion-fotos/${sec}/${reunion_id}/${Date.now()}-${cleanName(nombreArchivo)}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false })
    if (upErr) return { error: `Subiendo la captura: ${upErr.message}` }

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        reunion_id,
        seccion: sec,
        foto_path: path,
        foto_nombre: nombreArchivo,
        descripcion,
        creado_por: profile.id,
      })
      .select("id")
      .single()
    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error?.message ?? "No se pudo guardar la captura" }
    }
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo la captura",
    }
  }
}

export async function eliminarSeccionFoto(id: string): Promise<Result<true>> {
  try {
    await requireEditorReuniones()
    const supabase = await createClient()
    const { data: row } = await supabase
      .from(TABLE)
      .select("foto_path")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase.from(TABLE).delete().eq("id", id)
    if (error) return { error: error.message }
    const path = (row as { foto_path?: string } | null)?.foto_path
    if (path) await supabase.storage.from(BUCKET).remove([path])
    return { data: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando la imagen",
    }
  }
}

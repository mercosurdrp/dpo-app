"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

const BUCKET = "reuniones"
const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]

export interface AccionComercial {
  id: string
  reunion_id: string
  descripcion: string | null
  foto_nombre: string | null
  url: string | null
  created_at: string
}

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo editores pueden gestionar acciones comerciales")
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

export async function getAccionesComerciales(
  reunionId: string,
): Promise<Result<AccionComercial[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reunion_acciones_comerciales")
      .select("id, reunion_id, descripcion, foto_nombre, foto_path, created_at")
      .eq("reunion_id", reunionId)
      .order("created_at", { ascending: true })
    if (error) return { error: error.message }

    const out: AccionComercial[] = []
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const path = r.foto_path as string
      const signed = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600)
      out.push({
        id: r.id as string,
        reunion_id: r.reunion_id as string,
        descripcion: (r.descripcion as string | null) ?? null,
        foto_nombre: (r.foto_nombre as string | null) ?? null,
        url: signed.data?.signedUrl ?? null,
        created_at: r.created_at as string,
      })
    }
    return { data: out }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando acciones comerciales",
    }
  }
}

export async function subirAccionComercial(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const descripcion = String(formData.get("descripcion") ?? "").trim() || null
    const file = formData.get("foto") as File | null

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Subí una imagen" }
    }
    if (!file.type.startsWith("image/")) {
      return { error: "El archivo debe ser una imagen" }
    }

    const path = `acciones-comerciales/${reunion_id}/${Date.now()}-${cleanName(file.name)}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      })
    if (upErr) return { error: `Subiendo imagen: ${upErr.message}` }

    const { data, error } = await supabase
      .from("reunion_acciones_comerciales")
      .insert({
        reunion_id,
        foto_path: path,
        foto_nombre: file.name,
        descripcion,
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (error || !data) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: error?.message ?? "No se pudo guardar la acción comercial" }
    }
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo la imagen",
    }
  }
}

export async function eliminarAccionComercial(
  id: string,
): Promise<Result<true>> {
  try {
    await requireEditorReuniones()
    const supabase = await createClient()
    const { data: row } = await supabase
      .from("reunion_acciones_comerciales")
      .select("foto_path")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase
      .from("reunion_acciones_comerciales")
      .delete()
      .eq("id", id)
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

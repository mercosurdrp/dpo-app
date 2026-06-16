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

// Sube una imagen al bucket y registra la fila. Lanza Error en caso de fallo
// (lo capturan los wrappers públicos). `index` desambigua el path cuando se
// suben varias fotos en el mismo milisegundo.
async function uploadOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  reunion_id: string,
  descripcion: string | null,
  file: File,
  index = 0,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`"${file.name}" no es una imagen`)
  }
  const path = `acciones-comerciales/${reunion_id}/${Date.now()}-${index}-${cleanName(file.name)}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    })
  if (upErr) throw new Error(`Subiendo "${file.name}": ${upErr.message}`)

  const { data, error } = await supabase
    .from("reunion_acciones_comerciales")
    .insert({
      reunion_id,
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

    const id = await uploadOne(supabase, profile.id, reunion_id, descripcion, file)
    return { data: { id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo la imagen",
    }
  }
}

// Sube varias fotos en una sola llamada (key "fotos"). La descripción, si se
// pasa, se aplica a todas. Devuelve cuántas se subieron y los errores parciales.
export async function subirAccionesComerciales(
  formData: FormData,
): Promise<Result<{ subidas: number; errores: string[] }>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()

    const reunion_id = String(formData.get("reunion_id") ?? "").trim()
    const descripcion = String(formData.get("descripcion") ?? "").trim() || null
    const files = formData
      .getAll("fotos")
      .filter((f): f is File => f instanceof File && f.size > 0)

    if (!reunion_id) return { error: "La reunión es obligatoria" }
    if (files.length === 0) return { error: "Subí al menos una imagen" }

    let subidas = 0
    const errores: string[] = []
    // Secuencial: el bucket free puede limitar concurrencia y mantiene el orden.
    for (let i = 0; i < files.length; i++) {
      try {
        await uploadOne(supabase, profile.id, reunion_id, descripcion, files[i], i)
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

// Copia las fotos/slides de Acciones Comerciales de la reunión logística-ventas
// ANTERIOR (mismo tipo, fecha < actual) a esta reunión. Se agregan a las que ya
// haya (no borra nada). El Action Log NO se copia: las tareas vivas ya se
// arrastran solas semana a semana.
export async function copiarAccionesComercialesSemanaAnterior(
  reunionId: string,
): Promise<Result<{ copiadas: number }>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()

    // Reunión actual: fecha + tipo.
    const { data: reuActual } = await supabase
      .from("reuniones")
      .select("fecha, tipo")
      .eq("id", reunionId)
      .single()
    const reu = reuActual as { fecha: string; tipo: string } | null
    if (!reu) return { error: "No se encontró la reunión" }

    // Reunión anterior del mismo tipo.
    const { data: prev } = await supabase
      .from("reuniones")
      .select("id, fecha")
      .eq("tipo", reu.tipo)
      .lt("fecha", reu.fecha)
      .order("fecha", { ascending: false })
      .limit(1)
    const prevReu = (prev ?? [])[0] as { id: string; fecha: string } | undefined
    if (!prevReu) return { error: "No hay una reunión anterior para copiar" }

    const { data: rows, error: rowsErr } = await supabase
      .from("reunion_acciones_comerciales")
      .select("foto_path, foto_nombre, descripcion")
      .eq("reunion_id", prevReu.id)
      .order("created_at", { ascending: true })
    if (rowsErr) return { error: rowsErr.message }
    const prevRows = (rows ?? []) as Array<{
      foto_path: string
      foto_nombre: string | null
      descripcion: string | null
    }>
    if (prevRows.length === 0) {
      return { error: "La reunión anterior no tiene acciones comerciales cargadas" }
    }

    let copiadas = 0
    for (let i = 0; i < prevRows.length; i++) {
      const r = prevRows[i]
      const newPath = `acciones-comerciales/${reunionId}/${Date.now()}-${i}-${cleanName(
        r.foto_nombre ?? "foto.jpg",
      )}`
      const { error: copyErr } = await supabase.storage
        .from(BUCKET)
        .copy(r.foto_path, newPath)
      if (copyErr) continue
      const { error: insErr } = await supabase
        .from("reunion_acciones_comerciales")
        .insert({
          reunion_id: reunionId,
          foto_path: newPath,
          foto_nombre: r.foto_nombre,
          descripcion: r.descripcion,
          creado_por: profile.id,
        })
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([newPath])
        continue
      }
      copiadas++
    }

    if (copiadas === 0) {
      return { error: "No se pudo copiar ninguna acción comercial" }
    }
    return { data: { copiadas } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error copiando acciones comerciales",
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

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { registerActivity } from "@/lib/dpo-activity"
import type {
  DpoArchivo,
  DpoArchivoVersion,
  DpoActividad,
  DpoActividadTipo,
  DpoPuntoResumen,
} from "@/types/database"

const BUCKET = "dpo-evidencia"

type Result<T> = { data: T } | { error: string }

function extractExt(filename: string): string {
  const idx = filename.lastIndexOf(".")
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : ""
}

function tituloPunto(pilar: string, punto: string): string {
  if (pilar === "entrega" && punto === "1.1") return "Pre Ruta"
  if (pilar === "entrega" && punto === "1.2") return "En Ruta"
  return `Punto ${punto}`
}

export async function uploadArchivo(formData: FormData): Promise<Result<DpoArchivo>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const file = formData.get("file") as File | null
    const pilar_codigo = String(formData.get("pilar_codigo") || "").trim()
    const punto_codigo = String(formData.get("punto_codigo") || "").trim()
    const requisito_codigo = String(formData.get("requisito_codigo") || "").trim() || null
    const titulo = String(formData.get("titulo") || "").trim()
    const descripcion = String(formData.get("descripcion") || "").trim() || null
    const categoria = String(formData.get("categoria") || "").trim() || null

    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Archivo requerido" }
    }
    if (!pilar_codigo || !punto_codigo || !titulo) {
      return { error: "pilar_codigo, punto_codigo y titulo son requeridos" }
    }

    const archivo_id = crypto.randomUUID()
    const file_name = file.name
    const file_ext = extractExt(file_name)
    const mime_type = file.type || "application/octet-stream"
    const file_size = file.size
    const path = `${pilar_codigo}/${punto_codigo}/${archivo_id}/v1-${file_name}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType: mime_type, upsert: false })

    if (upErr) return { error: upErr.message }

    const { data: archivo, error: errArch } = await supabase
      .from("dpo_archivos")
      .insert({
        id: archivo_id,
        pilar_codigo,
        punto_codigo,
        requisito_codigo,
        titulo,
        descripcion,
        categoria,
        file_name,
        file_ext,
        mime_type,
        current_version: 1,
        current_file_path: path,
        current_file_size: file_size,
        uploaded_by: profile.id,
        archivado: false,
      })
      .select("*")
      .single()

    if (errArch) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: errArch.message }
    }

    const { error: errVer } = await supabase.from("dpo_archivo_versiones").insert({
      archivo_id,
      version: 1,
      file_path: path,
      file_name,
      file_size,
      notas: null,
      uploaded_by: profile.id,
    })

    if (errVer) {
      await supabase.storage.from(BUCKET).remove([path])
      await supabase.from("dpo_archivos").delete().eq("id", archivo_id)
      return { error: errVer.message }
    }

    await registerActivity(supabase, {
      tipo: "archivo_subido",
      titulo,
      pilar_codigo,
      punto_codigo,
      requisito_codigo: requisito_codigo ?? undefined,
      archivo_id,
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { file_name, file_size },
    })

    return { data: archivo as DpoArchivo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function nuevaVersion(formData: FormData): Promise<Result<DpoArchivo>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const file = formData.get("file") as File | null
    const archivo_id = String(formData.get("archivo_id") || "").trim()
    const notas = String(formData.get("notas") || "").trim() || null

    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Archivo requerido" }
    }
    if (!archivo_id) return { error: "archivo_id requerido" }

    const { data: existing, error: errEx } = await supabase
      .from("dpo_archivos")
      .select("*")
      .eq("id", archivo_id)
      .single()

    if (errEx) return { error: errEx.message }

    const current = existing as DpoArchivo
    const nextVersion = current.current_version + 1
    const file_name = file.name
    const file_ext = extractExt(file_name)
    const mime_type = file.type || "application/octet-stream"
    const file_size = file.size
    const path = `${current.pilar_codigo}/${current.punto_codigo}/${archivo_id}/v${nextVersion}-${file_name}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType: mime_type, upsert: false })

    if (upErr) return { error: upErr.message }

    const { error: errVer } = await supabase.from("dpo_archivo_versiones").insert({
      archivo_id,
      version: nextVersion,
      file_path: path,
      file_name,
      file_size,
      notas,
      uploaded_by: profile.id,
    })

    if (errVer) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: errVer.message }
    }

    const { data: updated, error: errUpd } = await supabase
      .from("dpo_archivos")
      .update({
        current_version: nextVersion,
        current_file_path: path,
        current_file_size: file_size,
        file_name,
        file_ext,
        mime_type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", archivo_id)
      .select("*")
      .single()

    if (errUpd) return { error: errUpd.message }

    await registerActivity(supabase, {
      tipo: "archivo_version_nueva",
      titulo: current.titulo,
      descripcion: notas ?? undefined,
      pilar_codigo: current.pilar_codigo,
      punto_codigo: current.punto_codigo,
      requisito_codigo: current.requisito_codigo ?? undefined,
      archivo_id,
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { version: nextVersion, file_name, file_size },
    })

    return { data: updated as DpoArchivo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface EditArchivoMetaInput {
  id: string
  titulo?: string
  descripcion?: string | null
  categoria?: string | null
  requisito_codigo?: string | null
}

export async function editArchivoMeta(
  input: EditArchivoMetaInput,
): Promise<Result<DpoArchivo>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const changedKeys: string[] = []
    if (input.titulo !== undefined) {
      update.titulo = input.titulo.trim()
      changedKeys.push("titulo")
    }
    if (input.descripcion !== undefined) {
      update.descripcion = input.descripcion?.toString().trim() || null
      changedKeys.push("descripcion")
    }
    if (input.categoria !== undefined) {
      update.categoria = input.categoria?.toString().trim() || null
      changedKeys.push("categoria")
    }
    if (input.requisito_codigo !== undefined) {
      update.requisito_codigo = input.requisito_codigo?.toString().trim() || null
      changedKeys.push("requisito_codigo")
    }

    const { data, error } = await supabase
      .from("dpo_archivos")
      .update(update)
      .eq("id", input.id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    const archivo = data as DpoArchivo
    await registerActivity(supabase, {
      tipo: "archivo_editado",
      titulo: archivo.titulo,
      pilar_codigo: archivo.pilar_codigo,
      punto_codigo: archivo.punto_codigo,
      requisito_codigo: archivo.requisito_codigo ?? undefined,
      archivo_id: archivo.id,
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { changed: changedKeys },
    })

    return { data: archivo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function archivarArchivo(id: string): Promise<Result<DpoArchivo>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("dpo_archivos")
      .update({ archivado: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    const archivo = data as DpoArchivo
    await registerActivity(supabase, {
      tipo: "archivo_editado",
      titulo: archivo.titulo,
      descripcion: "Archivado",
      pilar_codigo: archivo.pilar_codigo,
      punto_codigo: archivo.punto_codigo,
      requisito_codigo: archivo.requisito_codigo ?? undefined,
      archivo_id: archivo.id,
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { archivado: true },
    })

    return { data: archivo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteArchivo(id: string): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Solo admin puede eliminar archivos" }
    }
    const supabase = await createClient()

    const { data: archivo, error: errEx } = await supabase
      .from("dpo_archivos")
      .select("*")
      .eq("id", id)
      .single()
    if (errEx) return { error: errEx.message }

    const { data: versiones, error: errVers } = await supabase
      .from("dpo_archivo_versiones")
      .select("file_path")
      .eq("archivo_id", id)
    if (errVers) return { error: errVers.message }

    const paths = (versiones || []).map((v) => v.file_path as string)
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    await supabase.from("dpo_archivo_versiones").delete().eq("archivo_id", id)
    const { error: errDel } = await supabase.from("dpo_archivos").delete().eq("id", id)
    if (errDel) return { error: errDel.message }

    const arch = archivo as DpoArchivo
    await registerActivity(supabase, {
      tipo: "archivo_eliminado",
      titulo: arch.titulo,
      pilar_codigo: arch.pilar_codigo,
      punto_codigo: arch.punto_codigo,
      requisito_codigo: arch.requisito_codigo ?? undefined,
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { file_name: arch.file_name },
    })

    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

interface GetArchivosFilters {
  pilar_codigo?: string
  punto_codigo?: string
  categoria?: string
  archivado?: boolean
}

export async function getArchivos(
  filters?: GetArchivosFilters,
): Promise<Result<DpoArchivo[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("dpo_archivos")
      .select("*")
      .order("updated_at", { ascending: false })

    if (filters?.pilar_codigo) query = query.eq("pilar_codigo", filters.pilar_codigo)
    if (filters?.punto_codigo) query = query.eq("punto_codigo", filters.punto_codigo)
    if (filters?.categoria) query = query.eq("categoria", filters.categoria)
    if (filters?.archivado !== undefined) query = query.eq("archivado", filters.archivado)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as DpoArchivo[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getArchivoById(
  id: string,
): Promise<Result<{ archivo: DpoArchivo; versiones: DpoArchivoVersion[] }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [archRes, versRes] = await Promise.all([
      supabase.from("dpo_archivos").select("*").eq("id", id).single(),
      supabase
        .from("dpo_archivo_versiones")
        .select("*")
        .eq("archivo_id", id)
        .order("version", { ascending: false }),
    ])

    if (archRes.error) return { error: archRes.error.message }
    if (versRes.error) return { error: versRes.error.message }

    return {
      data: {
        archivo: archRes.data as DpoArchivo,
        versiones: (versRes.data || []) as DpoArchivoVersion[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getDownloadUrl(args: {
  version_id?: string
  archivo_id?: string
}): Promise<Result<{ url: string; filename: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let filePath: string | null = null
    let filename: string | null = null

    if (args.version_id) {
      const { data, error } = await supabase
        .from("dpo_archivo_versiones")
        .select("file_path, file_name")
        .eq("id", args.version_id)
        .single()
      if (error) return { error: error.message }
      filePath = data.file_path as string
      filename = data.file_name as string
    } else if (args.archivo_id) {
      const { data, error } = await supabase
        .from("dpo_archivos")
        .select("current_file_path, file_name")
        .eq("id", args.archivo_id)
        .single()
      if (error) return { error: error.message }
      filePath = data.current_file_path as string
      filename = data.file_name as string
    } else {
      return { error: "version_id o archivo_id requerido" }
    }

    const { data: signed, error: errSign } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 10)

    if (errSign || !signed) return { error: errSign?.message || "No se pudo firmar URL" }

    return { data: { url: signed.signedUrl, filename: filename! } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getResumenPuntos(): Promise<Result<DpoPuntoResumen[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const [archRes, actRes] = await Promise.all([
      supabase
        .from("dpo_archivos")
        .select("pilar_codigo, punto_codigo, updated_at")
        .eq("archivado", false),
      supabase.from("dpo_actividad").select("pilar_codigo, punto_codigo, created_at"),
    ])

    if (archRes.error) return { error: archRes.error.message }
    if (actRes.error) return { error: actRes.error.message }

    type Agg = {
      pilar_codigo: string
      punto_codigo: string
      total_archivos: number
      total_actividad: number
      ultimo_archivo: string | null
      ultima_actividad: string | null
    }
    const map = new Map<string, Agg>()

    const keyOf = (p: string, q: string) => `${p}|${q}`
    const ensure = (p: string, q: string): Agg => {
      const k = keyOf(p, q)
      if (!map.has(k)) {
        map.set(k, {
          pilar_codigo: p,
          punto_codigo: q,
          total_archivos: 0,
          total_actividad: 0,
          ultimo_archivo: null,
          ultima_actividad: null,
        })
      }
      return map.get(k)!
    }

    for (const r of archRes.data || []) {
      if (!r.pilar_codigo || !r.punto_codigo) continue
      const g = ensure(r.pilar_codigo as string, r.punto_codigo as string)
      g.total_archivos += 1
      const ts = r.updated_at as string
      if (!g.ultimo_archivo || ts > g.ultimo_archivo) g.ultimo_archivo = ts
    }
    for (const r of actRes.data || []) {
      if (!r.pilar_codigo || !r.punto_codigo) continue
      const g = ensure(r.pilar_codigo as string, r.punto_codigo as string)
      g.total_actividad += 1
      const ts = r.created_at as string
      if (!g.ultima_actividad || ts > g.ultima_actividad) g.ultima_actividad = ts
    }

    const out: DpoPuntoResumen[] = Array.from(map.values()).map((g) => ({
      ...g,
      titulo: tituloPunto(g.pilar_codigo, g.punto_codigo),
    }))

    out.sort((a, b) => {
      if (a.pilar_codigo !== b.pilar_codigo) return a.pilar_codigo.localeCompare(b.pilar_codigo)
      return a.punto_codigo.localeCompare(b.punto_codigo)
    })

    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getActividad(filters?: {
  pilar_codigo?: string
  punto_codigo?: string
  tipo?: DpoActividadTipo
  limit?: number
}): Promise<Result<DpoActividad[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("dpo_actividad")
      .select("*")
      .order("created_at", { ascending: false })

    if (filters?.pilar_codigo) query = query.eq("pilar_codigo", filters.pilar_codigo)
    if (filters?.punto_codigo) query = query.eq("punto_codigo", filters.punto_codigo)
    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as DpoActividad[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

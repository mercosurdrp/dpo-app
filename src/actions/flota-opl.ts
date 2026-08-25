"use server"

/**
 * OPL de flota — lecciones de un punto, alcanzadas por el QR de cada unidad.
 *
 * Una OPL es una hoja sola que explica UNA cosa y sirve sólo si está donde se
 * hace el trabajo: el estándar completo vive en el SOP, pero nadie abre 20
 * páginas parado al lado de la rueda. El QR pegado en la unidad
 * (/api/vehiculos/qr-pdf) abre la unidad en la app, y ahí aparecen las OPL que
 * le corresponden por tipo.
 *
 * El alcance es por TIPO de unidad, no por dominio: la OPL de "control de
 * dibujo" es la misma para los 11 camiones. `tipos` vacío = aplica a todas.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type { FlotaOpl } from "@/types/database"

const BUCKET = "mantenimiento-evidencias"
const PREFIJO = "opl"

type Result<T> = { data: T } | { error: string }

export async function getOpls(): Promise<Result<FlotaOpl[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_opl")
      .select("*")
      .order("orden", { ascending: true })
      .order("titulo", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaOpl[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * OPL que le aplican a una unidad. Se resuelve por tipo: las que declaran ese
 * tipo, más las de alcance general (`tipos` vacío). Sólo activas.
 */
export async function getOplsDeUnidad(tipo: string | null): Promise<Result<FlotaOpl[]>> {
  const res = await getOpls()
  if ("error" in res) return res
  return {
    data: res.data.filter(
      (o) => o.activo && (o.tipos.length === 0 || (tipo != null && o.tipos.includes(tipo)))
    ),
  }
}

/**
 * Crea una OPL. FormData: titulo, descripcion?, tipos? (CSV), punto_dpo?,
 * orden? y archivo? (la hoja en sí: PDF o imagen).
 */
export async function createOpl(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const titulo = String(formData.get("titulo") || "").trim()
    if (!titulo) return { error: "Falta el título de la OPL" }

    const tiposRaw = String(formData.get("tipos") || "").trim()
    const tipos = tiposRaw
      ? tiposRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : []

    let archivoPath: string | null = null
    let archivoUrl: string | null = null
    let archivoNombre: string | null = null
    const archivo = formData.get("archivo")
    if (archivo instanceof File && archivo.size > 0) {
      const clean = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `${PREFIJO}/${Date.now()}-${clean}`
      const ab = await archivo.arrayBuffer()
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, ab, {
        contentType: archivo.type || "application/octet-stream",
        upsert: false,
      })
      if (upErr) return { error: upErr.message }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      archivoPath = path
      archivoUrl = pub.publicUrl
      archivoNombre = archivo.name
    }

    const ordenRaw = String(formData.get("orden") || "").trim()
    const { error } = await supabase.from("flota_opl").insert({
      titulo,
      descripcion: String(formData.get("descripcion") || "").trim() || null,
      tipos,
      punto_dpo: String(formData.get("punto_dpo") || "").trim() || null,
      orden: ordenRaw ? Number(ordenRaw) || 0 : 0,
      archivo_path: archivoPath,
      archivo_url: archivoUrl,
      archivo_nombre: archivoNombre,
      created_by: profile.id,
    })
    if (error) {
      // No dejar el archivo huérfano si la fila no entró.
      if (archivoPath) await supabase.storage.from(BUCKET).remove([archivoPath])
      return { error: error.message }
    }
    revalidatePath("/vehiculos/opl")
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function setOplActivo(
  id: string,
  activo: boolean
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_opl")
      .update({ activo, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/vehiculos/opl")
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteOpl(id: string): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { data: fila } = await supabase
      .from("flota_opl")
      .select("archivo_path")
      .eq("id", id)
      .maybeSingle()
    const { error } = await supabase.from("flota_opl").delete().eq("id", id)
    if (error) return { error: error.message }
    const path = (fila as { archivo_path: string | null } | null)?.archivo_path
    if (path) await supabase.storage.from(BUCKET).remove([path])
    revalidatePath("/vehiculos/opl")
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

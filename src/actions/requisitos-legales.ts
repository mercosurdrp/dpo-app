"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import type {
  Profile,
  RequisitoLegal,
  RequisitoLegalCategoria,
  RequisitoLegalConResponsable,
  EstadoRequisitoLegal,
  RequisitoLegalAlertaConfig,
} from "@/types/database"

const BUCKET = "requisitos-legales"
const REVALIDATE_PATH = "/requisitos-legales"
const DIAS_ALERTA = 30

type Result<T> = { data: T } | { error: string }

// =============================================
// Helpers
// =============================================

function calcularEstado(
  fechaVencimiento: string,
  hoy: Date = new Date(),
): { estado: EstadoRequisitoLegal; dias: number } {
  const venc = new Date(fechaVencimiento + "T00:00:00")
  const hoyDate = new Date(hoy.toISOString().slice(0, 10) + "T00:00:00")
  const ms = venc.getTime() - hoyDate.getTime()
  const dias = Math.round(ms / 86400000)

  if (dias < 0) return { estado: "vencido", dias }
  if (dias <= DIAS_ALERTA) return { estado: "por_vencer", dias }
  return { estado: "vigente", dias }
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar requisitos legales")
  }
  return profile
}

// =============================================
// Lectura
// =============================================

export async function listCategorias(): Promise<
  Result<RequisitoLegalCategoria[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("requisitos_legales_categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true })
    if (error) return { error: error.message }
    return { data: (data ?? []) as RequisitoLegalCategoria[] }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando categorías",
    }
  }
}

export async function listRequisitos(): Promise<
  Result<RequisitoLegalConResponsable[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("requisitos_legales")
      .select(
        "*, responsable:profiles!requisitos_legales_responsable_id_fkey(id, nombre, email)",
      )
      .order("fecha_vencimiento", { ascending: true })

    if (error) return { error: error.message }

    const enriched: RequisitoLegalConResponsable[] = (data ?? []).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const { estado, dias } = calcularEstado(r.fecha_vencimiento)
      return {
        id: r.id,
        categoria_id: r.categoria_id,
        nombre: r.nombre,
        fecha_emision: r.fecha_emision,
        fecha_vencimiento: r.fecha_vencimiento,
        responsable_id: r.responsable_id,
        archivo_url: r.archivo_url,
        archivo_nombre: r.archivo_nombre,
        observaciones: r.observaciones,
        created_by: r.created_by,
        created_at: r.created_at,
        updated_at: r.updated_at,
        responsable_nombre: r.responsable?.nombre ?? null,
        responsable_email: r.responsable?.email ?? null,
        estado,
        dias_para_vencer: dias,
      }
    })

    return { data: enriched }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando requisitos legales",
    }
  }
}

export async function listResponsablesPosibles(): Promise<
  Result<Pick<Profile, "id" | "nombre" | "email">[]>
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
      data: (data ?? []) as Pick<Profile, "id" | "nombre" | "email">[],
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando usuarios",
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
      .createSignedUrl(archivoUrl, 60 * 10)
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

// =============================================
// Mutaciones de categorías
// =============================================

export async function actualizarResponsablePrincipal(
  categoriaId: string,
  responsableId: string | null,
): Promise<Result<RequisitoLegalCategoria>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("requisitos_legales_categorias")
      .update({ responsable_principal_id: responsableId })
      .eq("id", categoriaId)
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegalCategoria }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando categoría",
    }
  }
}

// =============================================
// Mutaciones de items
// =============================================

export async function crearRequisito(
  formData: FormData,
): Promise<Result<RequisitoLegal>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const categoria_id = String(formData.get("categoria_id") ?? "").trim()
    const nombre = String(formData.get("nombre") ?? "").trim()
    const fecha_emision = String(formData.get("fecha_emision") ?? "").trim() || null
    const fecha_vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim()
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null
    const file = formData.get("archivo") as File | null

    if (!categoria_id) return { error: "La categoría es obligatoria" }
    if (!nombre) return { error: "El nombre del requisito es obligatorio" }
    if (!fecha_vencimiento) return { error: "La fecha de vencimiento es obligatoria" }

    let archivo_url: string | null = null
    let archivo_nombre: string | null = null

    if (file && file instanceof File && file.size > 0) {
      const requisitoId = crypto.randomUUID()
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `${categoria_id}/${requisitoId}/v1-${cleanName}`
      const arrayBuffer = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }
      archivo_url = path
      archivo_nombre = file.name
    }

    const { data, error } = await supabase
      .from("requisitos_legales")
      .insert({
        categoria_id,
        nombre,
        fecha_emision,
        fecha_vencimiento,
        responsable_id,
        archivo_url,
        archivo_nombre,
        observaciones,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) {
      if (archivo_url) {
        await supabase.storage.from(BUCKET).remove([archivo_url])
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegal }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando requisito",
    }
  }
}

export async function actualizarRequisito(
  id: string,
  formData: FormData,
): Promise<Result<RequisitoLegal>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const nombre = String(formData.get("nombre") ?? "").trim()
    const fecha_emision = String(formData.get("fecha_emision") ?? "").trim() || null
    const fecha_vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim()
    const responsable_id =
      String(formData.get("responsable_id") ?? "").trim() || null
    const observaciones =
      String(formData.get("observaciones") ?? "").trim() || null

    if (!nombre) return { error: "El nombre del requisito es obligatorio" }
    if (!fecha_vencimiento) return { error: "La fecha de vencimiento es obligatoria" }

    const { data, error } = await supabase
      .from("requisitos_legales")
      .update({
        nombre,
        fecha_emision,
        fecha_vencimiento,
        responsable_id,
        observaciones,
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegal }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando requisito",
    }
  }
}

/**
 * Renovar: sube nuevo archivo y actualiza fecha de emisión + vencimiento.
 * Borra el archivo anterior si existía.
 */
export async function renovarRequisito(
  id: string,
  formData: FormData,
): Promise<Result<RequisitoLegal>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const fecha_emision = String(formData.get("fecha_emision") ?? "").trim()
    const fecha_vencimiento = String(formData.get("fecha_vencimiento") ?? "").trim()
    const file = formData.get("archivo") as File | null

    if (!fecha_emision) return { error: "La fecha de emisión es obligatoria" }
    if (!fecha_vencimiento) return { error: "La fecha de vencimiento es obligatoria" }
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: "Subí el archivo de la renovación" }
    }

    const { data: actual, error: errActual } = await supabase
      .from("requisitos_legales")
      .select("archivo_url, categoria_id")
      .eq("id", id)
      .single()
    if (errActual) return { error: errActual.message }

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
    const newPath = `${actual.categoria_id}/${id}/v${Date.now()}-${cleanName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })
    if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }

    const { data, error } = await supabase
      .from("requisitos_legales")
      .update({
        fecha_emision,
        fecha_vencimiento,
        archivo_url: newPath,
        archivo_nombre: file.name,
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([newPath])
      return { error: error.message }
    }

    if (actual?.archivo_url) {
      await supabase.storage.from(BUCKET).remove([actual.archivo_url])
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RequisitoLegal }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error renovando requisito",
    }
  }
}

export async function eliminarRequisito(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("requisitos_legales")
      .select("archivo_url")
      .eq("id", id)
      .single()

    const { error } = await supabase
      .from("requisitos_legales")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    if (actual?.archivo_url) {
      await supabase.storage.from(BUCKET).remove([actual.archivo_url])
    }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando requisito",
    }
  }
}

// =============================================
// Permisos para la UI
// =============================================

export async function puedeEditarRequisitos(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

// =============================================
// Config de alertas
// =============================================

export async function listAlertasConfig(): Promise<
  Result<RequisitoLegalAlertaConfig[]>
> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("requisitos_legales_alertas_config")
      .select("*")
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as RequisitoLegalAlertaConfig[] }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando configuración",
    }
  }
}

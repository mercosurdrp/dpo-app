"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { RiesgoExternoContacto } from "@/types/database"

const REVALIDATE_PATH = "/riesgos-externos"

type Result<T> = { data: T } | { error: string }

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar el directorio de contactos")
  }
  return profile
}

export async function listContactos(): Promise<Result<RiesgoExternoContacto[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("riesgos_externos_contactos")
      .select("*")
      .eq("activo", true)
      .order("tipo_riesgo")
      .order("orden")
      .order("nombre")

    if (error) return { error: error.message }
    return { data: (data ?? []) as RiesgoExternoContacto[] }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando contactos",
    }
  }
}

function parseFormData(formData: FormData) {
  const opt = (k: string) => String(formData.get(k) ?? "").trim() || null

  return {
    tipo_riesgo: String(formData.get("tipo_riesgo") ?? "").trim(),
    nombre: String(formData.get("nombre") ?? "").trim(),
    categoria: String(formData.get("categoria") ?? "externo").trim(),
    empresa: opt("empresa"),
    referente: opt("referente"),
    telefono: opt("telefono"),
    telefono_alt: opt("telefono_alt"),
    email: opt("email"),
    horario: opt("horario"),
    notas: opt("notas"),
    orden: Number(formData.get("orden") ?? 0) || 0,
  }
}

function validar(payload: ReturnType<typeof parseFormData>): string | null {
  if (!payload.tipo_riesgo) return "Seleccioná el riesgo"
  if (!payload.nombre) return "El nombre del contacto es obligatorio"
  return null
}

export async function crearContacto(
  formData: FormData,
): Promise<Result<RiesgoExternoContacto>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const payload = parseFormData(formData)
    const invalido = validar(payload)
    if (invalido) return { error: invalido }

    const { data, error } = await supabase
      .from("riesgos_externos_contactos")
      .insert({ ...payload, created_by: profile.id })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return { error: "Ese contacto ya está cargado para este riesgo" }
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RiesgoExternoContacto }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando el contacto",
    }
  }
}

export async function actualizarContacto(
  id: string,
  formData: FormData,
): Promise<Result<RiesgoExternoContacto>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const payload = parseFormData(formData)
    const invalido = validar(payload)
    if (invalido) return { error: invalido }

    const { data, error } = await supabase
      .from("riesgos_externos_contactos")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return { error: "Ese contacto ya está cargado para este riesgo" }
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RiesgoExternoContacto }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error actualizando el contacto",
    }
  }
}

export async function eliminarContacto(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { error } = await supabase
      .from("riesgos_externos_contactos")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el contacto",
    }
  }
}

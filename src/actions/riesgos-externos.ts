"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import type {
  Profile,
  RiesgoExternoAccion,
  RiesgoExternoAccionConResponsable,
} from "@/types/database"

const REVALIDATE_PATH = "/riesgos-externos"

type Result<T> = { data: T } | { error: string }

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar el plan de acción de riesgos externos")
  }
  return profile
}

// =============================================
// Lectura
// =============================================

export async function listAcciones(): Promise<
  Result<RiesgoExternoAccionConResponsable[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("riesgos_externos_acciones")
      .select(
        "*, responsable:profiles!riesgos_externos_acciones_responsable_id_fkey(id, nombre, email)",
      )
      .order("nro_correlativo", { ascending: false })

    if (error) return { error: error.message }

    const enriched: RiesgoExternoAccionConResponsable[] = (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (row: any) => ({
        id: row.id,
        nro_correlativo: row.nro_correlativo,
        tipo_riesgo: row.tipo_riesgo,
        observaciones: row.observaciones,
        resolucion: row.resolucion,
        fecha_ocurrencia: row.fecha_ocurrencia,
        responsable_id: row.responsable_id,
        tarea_pendiente: row.tarea_pendiente,
        fecha_compromiso: row.fecha_compromiso,
        fecha_cierre_real: row.fecha_cierre_real,
        estado: row.estado,
        semana: row.semana,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        responsable_nombre: row.responsable?.nombre ?? null,
        responsable_email: row.responsable?.email ?? null,
      }),
    )

    return { data: enriched }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando acciones de riesgo",
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

export async function puedeEditarRiesgosExternos(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  return ["admin", "supervisor", "admin_rrhh"].includes(profile.role)
}

// =============================================
// Mutaciones
// =============================================

function parseFormData(formData: FormData) {
  const tipo_riesgo = String(formData.get("tipo_riesgo") ?? "").trim()
  const observaciones = String(formData.get("observaciones") ?? "").trim()
  const resolucion = String(formData.get("resolucion") ?? "").trim() || null
  const fecha_ocurrencia = String(formData.get("fecha_ocurrencia") ?? "").trim()
  const responsable_id =
    String(formData.get("responsable_id") ?? "").trim() || null
  const tarea_pendiente =
    String(formData.get("tarea_pendiente") ?? "").trim() || null
  const fecha_compromiso =
    String(formData.get("fecha_compromiso") ?? "").trim() || null
  const fecha_cierre_real =
    String(formData.get("fecha_cierre_real") ?? "").trim() || null
  const estado = String(formData.get("estado") ?? "").trim() || "no_iniciado"

  return {
    tipo_riesgo,
    observaciones,
    resolucion,
    fecha_ocurrencia,
    responsable_id,
    tarea_pendiente,
    fecha_compromiso,
    fecha_cierre_real,
    estado,
  }
}

export async function crearAccion(
  formData: FormData,
): Promise<Result<RiesgoExternoAccion>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const payload = parseFormData(formData)

    if (!payload.tipo_riesgo) return { error: "Seleccioná el tipo de riesgo" }
    if (!payload.observaciones) return { error: "Las observaciones son obligatorias" }
    if (!payload.fecha_ocurrencia) return { error: "La fecha de ocurrencia es obligatoria" }

    const { data, error } = await supabase
      .from("riesgos_externos_acciones")
      .insert({
        ...payload,
        created_by: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RiesgoExternoAccion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando la acción",
    }
  }
}

export async function actualizarAccion(
  id: string,
  formData: FormData,
): Promise<Result<RiesgoExternoAccion>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const payload = parseFormData(formData)

    if (!payload.tipo_riesgo) return { error: "Seleccioná el tipo de riesgo" }
    if (!payload.observaciones) return { error: "Las observaciones son obligatorias" }
    if (!payload.fecha_ocurrencia) return { error: "La fecha de ocurrencia es obligatoria" }

    const { data, error } = await supabase
      .from("riesgos_externos_acciones")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RiesgoExternoAccion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando la acción",
    }
  }
}

export async function eliminarAccion(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { error } = await supabase
      .from("riesgos_externos_acciones")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando la acción",
    }
  }
}

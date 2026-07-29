"use server"

/**
 * Plan de respuesta a riesgos externos (DPO Planeamiento 2.2, R2.2.2):
 * matriz de escalamiento + nivel de servicio, mano de obra y ajuste de
 * pronóstico por riesgo.
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  RiesgoExternoConfig,
  RiesgoExternoEscalamiento,
  TipoRiesgoExterno,
} from "@/types/database"

const REVALIDATE_PATH = "/riesgos-externos"

type Result<T> = { data: T } | { error: string }

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar el plan de respuesta")
  }
  return profile
}

export async function listEscalamiento(): Promise<
  Result<RiesgoExternoEscalamiento[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("riesgos_externos_escalamiento")
      .select("*")
      .eq("activo", true)
      .order("tipo_riesgo")
      .order("nivel")

    if (error) return { error: error.message }
    return { data: (data ?? []) as RiesgoExternoEscalamiento[] }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando el escalamiento",
    }
  }
}

function parseEscalamiento(formData: FormData) {
  const opt = (k: string) => String(formData.get(k) ?? "").trim() || null
  const minutosRaw = String(formData.get("minutos_disparo") ?? "").trim()

  return {
    tipo_riesgo: String(formData.get("tipo_riesgo") ?? "").trim(),
    nivel: Number(formData.get("nivel") ?? 0),
    rol: String(formData.get("rol") ?? "").trim(),
    suplente: opt("suplente"),
    disparador: String(formData.get("disparador") ?? "").trim(),
    minutos_disparo: minutosRaw === "" ? null : Number(minutosRaw),
    acciones: opt("acciones"),
  }
}

function validarEscalamiento(
  payload: ReturnType<typeof parseEscalamiento>,
): string | null {
  if (!payload.tipo_riesgo) return "Seleccioná el riesgo"
  if (!Number.isInteger(payload.nivel) || payload.nivel < 1 || payload.nivel > 5) {
    return "El nivel debe estar entre 1 y 5"
  }
  if (!payload.rol) return "Indicá quién actúa en este nivel"
  if (!payload.disparador) return "Indicá cuándo se escala a este nivel"
  if (
    payload.minutos_disparo !== null &&
    (!Number.isFinite(payload.minutos_disparo) || payload.minutos_disparo < 0)
  ) {
    return "El tiempo de disparo debe ser un número de minutos válido"
  }
  return null
}

/** Crea o actualiza un nivel de escalamiento (uno por riesgo y nivel). */
export async function guardarEscalamiento(
  id: string | null,
  formData: FormData,
): Promise<Result<RiesgoExternoEscalamiento>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const payload = parseEscalamiento(formData)
    const invalido = validarEscalamiento(payload)
    if (invalido) return { error: invalido }

    const query = id
      ? supabase
          .from("riesgos_externos_escalamiento")
          .update(payload)
          .eq("id", id)
      : supabase
          .from("riesgos_externos_escalamiento")
          .insert({ ...payload, created_by: profile.id })

    const { data, error } = await query.select("*").single()

    if (error) {
      if (error.code === "23505") {
        return { error: "Ese riesgo ya tiene definido ese nivel de escalamiento" }
      }
      return { error: error.message }
    }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RiesgoExternoEscalamiento }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error guardando el escalamiento",
    }
  }
}

export async function eliminarEscalamiento(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { error } = await supabase
      .from("riesgos_externos_escalamiento")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error eliminando el escalamiento",
    }
  }
}

/**
 * Guarda los tres bloques de R2.2.2 de un riesgo. Se hace por upsert porque un
 * riesgo del enum puede no tener todavía fila en config.
 */
export async function guardarPlanRespuesta(
  tipoRiesgo: TipoRiesgoExterno,
  formData: FormData,
): Promise<Result<RiesgoExternoConfig>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const opt = (k: string) => String(formData.get(k) ?? "").trim() || null

    const { data, error } = await supabase
      .from("riesgos_externos_config")
      .upsert(
        {
          tipo_riesgo: tipoRiesgo,
          plan_nivel_servicio: opt("plan_nivel_servicio"),
          plan_mano_obra: opt("plan_mano_obra"),
          plan_ajuste_pronostico: opt("plan_ajuste_pronostico"),
          updated_by: profile.id,
        },
        { onConflict: "tipo_riesgo" },
      )
      .select("*")
      .single()

    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as RiesgoExternoConfig }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error guardando el plan de respuesta",
    }
  }
}

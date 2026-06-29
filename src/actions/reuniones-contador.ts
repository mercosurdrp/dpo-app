"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Estado compartido del contador de la reunión de Logística (Pampeana).
 * A diferencia del contador local anterior (localStorage por navegador), este
 * estado vive en la DB: el inicio y la finalización son compartidos entre todos
 * los participantes y, una vez finalizada, nadie puede volver a iniciarlo.
 */

const REVALIDATE_PATH = "/reuniones"
const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]

type Result<T> = { data: T } | { error: string }

export type ContadorEstado = "inactivo" | "en_curso" | "finalizada"

export type ContadorReunionData = {
  reunion_id: string
  minutos: number
  estado: ContadorEstado
  inicio_at: string | null
  fin_previsto_at: string | null
  finalizada_at: string | null
  restante_final_seg: number | null
}

function estadoDefault(
  reunionId: string,
  minutos: number,
): ContadorReunionData {
  return {
    reunion_id: reunionId,
    minutos,
    estado: "inactivo",
    inicio_at: null,
    fin_previsto_at: null,
    finalizada_at: null,
    restante_final_seg: null,
  }
}

/** Lee el estado del contador. Si no hay fila, devuelve un default "inactivo". */
export async function getContador(
  reunionId: string,
  minutosDefault = 30,
): Promise<Result<ContadorReunionData>> {
  try {
    if (!reunionId) return { error: "ID de reunión inválido" }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reuniones_contador")
      .select(
        "reunion_id, minutos, estado, inicio_at, fin_previsto_at, finalizada_at, restante_final_seg",
      )
      .eq("reunion_id", reunionId)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { data: estadoDefault(reunionId, minutosDefault) }
    return { data: data as ContadorReunionData }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error leyendo el contador",
    }
  }
}

/**
 * Inicia el contador. Solo editores. Falla si la reunión ya fue finalizada.
 * Si ya está en curso, es idempotente (devuelve el estado actual).
 */
export async function iniciarContador(
  reunionId: string,
  minutos = 30,
): Promise<Result<ContadorReunionData>> {
  try {
    if (!reunionId) return { error: "ID de reunión inválido" }
    const profile = await requireAuth()
    if (!EDITOR_ROLES.includes(profile.role)) {
      return { error: "Solo un supervisor o administrador puede iniciar el contador" }
    }
    const supabase = await createClient()

    const { data: actual, error: errLeer } = await supabase
      .from("reuniones_contador")
      .select("estado, inicio_at, fin_previsto_at, minutos")
      .eq("reunion_id", reunionId)
      .maybeSingle()
    if (errLeer) return { error: errLeer.message }

    const estadoActual = (actual as { estado?: ContadorEstado } | null)?.estado
    if (estadoActual === "finalizada") {
      return { error: "La reunión ya fue finalizada; no se puede volver a iniciar el contador." }
    }
    if (estadoActual === "en_curso") {
      // Ya está corriendo: idempotente.
      return getContador(reunionId, minutos)
    }

    const mins = Math.max(1, Math.round(minutos))
    const ahora = Date.now()
    const inicio = new Date(ahora).toISOString()
    const finPrevisto = new Date(ahora + mins * 60_000).toISOString()

    const { data, error } = await supabase
      .from("reuniones_contador")
      .upsert(
        {
          reunion_id: reunionId,
          minutos: mins,
          estado: "en_curso",
          inicio_at: inicio,
          fin_previsto_at: finPrevisto,
          finalizada_at: null,
          restante_final_seg: null,
          iniciado_por: profile.id,
          finalizada_por: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reunion_id" },
      )
      .select(
        "reunion_id, minutos, estado, inicio_at, fin_previsto_at, finalizada_at, restante_final_seg",
      )
      .single()

    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as ContadorReunionData }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error iniciando el contador",
    }
  }
}

/**
 * Finaliza el contador y cierra la reunión. Solo editores. Registra el tiempo
 * que quedaba en el contador como resultado final. Estado terminal: una vez
 * finalizada, nadie puede volver a iniciarla.
 */
export async function finalizarContador(
  reunionId: string,
): Promise<Result<ContadorReunionData>> {
  try {
    if (!reunionId) return { error: "ID de reunión inválido" }
    const profile = await requireAuth()
    if (!EDITOR_ROLES.includes(profile.role)) {
      return { error: "Solo un supervisor o administrador puede finalizar la reunión" }
    }
    const supabase = await createClient()

    const { data: actual, error: errLeer } = await supabase
      .from("reuniones_contador")
      .select("estado, fin_previsto_at, minutos")
      .eq("reunion_id", reunionId)
      .maybeSingle()
    if (errLeer) return { error: errLeer.message }

    const fila = actual as
      | { estado: ContadorEstado; fin_previsto_at: string | null; minutos: number }
      | null

    if (!fila || fila.estado === "inactivo") {
      return { error: "El contador no fue iniciado." }
    }
    if (fila.estado === "finalizada") {
      return { error: "La reunión ya está finalizada." }
    }

    // Segundos que quedaban en el contador al momento de finalizar.
    const finMs = fila.fin_previsto_at ? new Date(fila.fin_previsto_at).getTime() : Date.now()
    const restante = Math.max(0, Math.round((finMs - Date.now()) / 1000))

    const { data, error } = await supabase
      .from("reuniones_contador")
      .update({
        estado: "finalizada",
        fin_previsto_at: null,
        finalizada_at: new Date().toISOString(),
        restante_final_seg: restante,
        finalizada_por: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("reunion_id", reunionId)
      .select(
        "reunion_id, minutos, estado, inicio_at, fin_previsto_at, finalizada_at, restante_final_seg",
      )
      .single()

    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as ContadorReunionData }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error finalizando la reunión",
    }
  }
}

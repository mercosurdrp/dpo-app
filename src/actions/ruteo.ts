"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "El ruteo solo está disponible en Pampeana."

const SELECT_COLS =
  "id, fecha, estado, hora_inicio, hora_fin, pergamino_bultos, pergamino_clientes, ramallo_bultos, ramallo_clientes, notas, created_at"

export interface RuteoCierre {
  id: string
  fecha: string
  estado: "en_curso" | "cerrado"
  hora_inicio: string
  hora_fin: string | null
  pergamino_bultos: number
  pergamino_clientes: number
  ramallo_bultos: number
  ramallo_clientes: number
  notas: string | null
  created_at: string
}

export interface FinRuteoInput {
  id: string
  pergamino_bultos: number
  pergamino_clientes: number
  ramallo_bultos: number
  ramallo_clientes: number
  notas?: string | null
}

// Fecha de "hoy" en hora Argentina (UTC-3, sin DST). Evita el corrimiento de
// día que produce slice(ISO) cuando ya pasaron las 21:00 ARG.
function hoyARG(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function toIntNoNeg(v: unknown): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Estado del ruteo del día actual. `null` si todavía no se inició hoy. */
export async function getRuteoDelDia(): Promise<Result<RuteoCierre | null>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .select(SELECT_COLS)
      .eq("fecha", hoyARG())
      .maybeSingle()

    if (error) return { error: error.message }
    return { data: (data as RuteoCierre | null) ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/**
 * INICIO DE RUTEO: crea la fila del día con hora_inicio = now() (default DB).
 * Devuelve error si ya hay un ruteo iniciado hoy (UNIQUE(fecha)).
 */
export async function iniciarRuteo(): Promise<Result<RuteoCierre>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .insert({ fecha: hoyARG(), created_by: profile.id })
      .select(SELECT_COLS)
      .single()

    if (error) {
      if (error.code === "23505") {
        return { error: "Ya hay un ruteo iniciado hoy." }
      }
      return { error: error.message }
    }
    revalidatePath("/ruteo")
    return { data: data as RuteoCierre }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/**
 * FIN DE RUTEO: setea hora_fin = now(), estado = 'cerrado' y los datos por
 * ciudad. Solo cierra una fila que esté 'en_curso'.
 */
export async function finalizarRuteo(
  input: FinRuteoInput
): Promise<Result<RuteoCierre>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .update({
        estado: "cerrado",
        hora_fin: new Date().toISOString(),
        pergamino_bultos: toIntNoNeg(input.pergamino_bultos),
        pergamino_clientes: toIntNoNeg(input.pergamino_clientes),
        ramallo_bultos: toIntNoNeg(input.ramallo_bultos),
        ramallo_clientes: toIntNoNeg(input.ramallo_clientes),
        notas: input.notas?.trim() || null,
      })
      .eq("id", input.id)
      .eq("estado", "en_curso")
      .select(SELECT_COLS)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: "El ruteo ya fue cerrado o no existe." }
    revalidatePath("/ruteo")
    return { data: data as RuteoCierre }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Historial de cierres anteriores (más recientes primero). */
export async function listarRuteoHistorial(
  limit = 60
): Promise<Result<RuteoCierre[]>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .select(SELECT_COLS)
      .eq("estado", "cerrado")
      .order("fecha", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message }
    return { data: (data ?? []) as RuteoCierre[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

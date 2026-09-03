"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

/**
 * Choferes excluidos del TML. La exclusión vive en `tml_choferes_excluidos` y
 * la aplica un trigger que deja `tml_minutos` NULL en sus egresos desde
 * `desde`; todos los cálculos del indicador ya filtran los NULL, así que el
 * chofer desaparece del TML sin dejar de existir en la salida, el FTE ni la
 * atribución de bultos. Caso que lo motivó: Cerbin sale antes de las 07:00 y
 * su "TML" de 40-57 min es hora de entrada, no demora de liberación.
 */
export interface TmlChoferExcluido {
  chofer: string
  desde: string
  motivo: string | null
  created_at: string
}

export async function getTmlChoferesExcluidos(): Promise<
  { data: TmlChoferExcluido[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tml_choferes_excluidos")
      .select("chofer, desde, motivo, created_at")
      .order("chofer")
    if (error) {
      // La tabla llega con la migración 20260831150000: sin ella, lista vacía.
      if (/tml_choferes_excluidos/.test(error.message)) return { data: [] }
      return { error: error.message }
    }
    return { data: (data ?? []) as TmlChoferExcluido[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Excluye (o vuelve a incluir) a un chofer. Devuelve cuántos egresos se
 * recalcularon. `desde` sólo aplica al excluir: egresos anteriores conservan
 * su TML histórico.
 */
export async function setTmlExclusionChofer(input: {
  chofer: string
  excluir: boolean
  motivo?: string | null
  desde?: string
}): Promise<{ data: { egresosAfectados: number } } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const chofer = input.chofer.trim().toUpperCase()
    if (!chofer) return { error: "Falta el chofer" }
    if (input.desde && !/^\d{4}-\d{2}-\d{2}$/.test(input.desde)) {
      return { error: "Fecha 'desde' inválida" }
    }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("tml_set_exclusion", {
      p_chofer: chofer,
      p_excluir: input.excluir,
      p_motivo: input.motivo?.trim() || null,
      p_desde: input.desde ?? new Date().toISOString().slice(0, 10),
    })
    if (error) return { error: error.message }
    return { data: { egresosAfectados: Number(data ?? 0) } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

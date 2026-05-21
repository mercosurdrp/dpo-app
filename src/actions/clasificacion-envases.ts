"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  agregarProductividad,
  type ClasificacionEnvaseRow,
  type ProductividadTotales,
} from "@/lib/clasificacion-envases"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "La clasificación de envases solo está disponible en Pampeana."

export interface ClasificacionEnvaseInput {
  fecha?: string
  hora_inicio: string
  hora_fin: string
  pallets_total: number
  pallets_rotos: number
  cajones_total: number
  cajones_rotos: number
  botellas_rotas: number
  notas?: string | null
}

export interface ClasificacionEnvaseItem {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  pallets_total: number
  pallets_rotos: number
  cajones_total: number
  cajones_rotos: number
  botellas_rotas: number
  notas: string | null
  created_at: string
}

export interface ClasificacionDelDia {
  fecha: string
  cargas: ClasificacionEnvaseItem[]
  resumen: ProductividadTotales
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

const SELECT_COLS =
  "id, fecha, hora_inicio, hora_fin, pallets_total, pallets_rotos, cajones_total, cajones_rotos, botellas_rotas, notas, created_at"

export async function crearClasificacion(
  input: ClasificacionEnvaseInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const hi = (input.hora_inicio ?? "").trim()
    const hf = (input.hora_fin ?? "").trim()
    if (!/^\d{1,2}:\d{2}/.test(hi) || !/^\d{1,2}:\d{2}/.test(hf)) {
      return { error: "Cargá la hora de inicio y de fin." }
    }

    const pallets_total = toIntNoNeg(input.pallets_total)
    const pallets_rotos = toIntNoNeg(input.pallets_rotos)
    const cajones_total = toIntNoNeg(input.cajones_total)
    const cajones_rotos = toIntNoNeg(input.cajones_rotos)
    const botellas_rotas = toIntNoNeg(input.botellas_rotas)

    if (pallets_rotos > pallets_total) {
      return { error: "Los pallets rotos no pueden superar el total a clasificar." }
    }
    if (cajones_rotos > cajones_total) {
      return { error: "Los cajones rotos no pueden superar el total a clasificar." }
    }
    if (pallets_total === 0 && cajones_total === 0 && botellas_rotas === 0) {
      return { error: "Cargá al menos una cantidad de pallets, cajones o botellas." }
    }

    const fecha = input.fecha && /^\d{4}-\d{2}-\d{2}$/.test(input.fecha) ? input.fecha : hoyARG()

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("clasificacion_envases")
      .insert({
        fecha,
        hora_inicio: hi,
        hora_fin: hf,
        pallets_total,
        pallets_rotos,
        cajones_total,
        cajones_rotos,
        botellas_rotas,
        notas: input.notas?.trim() || null,
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (error) return { error: error.message }
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function getClasificacionDelDia(fecha?: string): Promise<Result<ClasificacionDelDia>> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyARG()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("clasificacion_envases")
      .select(SELECT_COLS)
      .eq("fecha", dia)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    const cargas = (data ?? []) as ClasificacionEnvaseItem[]
    const rows: ClasificacionEnvaseRow[] = cargas.map((c) => ({
      fecha: c.fecha,
      hora_inicio: c.hora_inicio,
      hora_fin: c.hora_fin,
      pallets_total: c.pallets_total,
      pallets_rotos: c.pallets_rotos,
      cajones_total: c.cajones_total,
      cajones_rotos: c.cajones_rotos,
      botellas_rotas: c.botellas_rotas,
    }))
    const resumen = agregarProductividad(rows, dia, dia).totales
    return { data: { fecha: dia, cargas, resumen } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function borrarClasificacion(id: string): Promise<Result<{ ok: true }>> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    // RLS limita el borrado al autor o admin/auditor.
    const { error } = await supabase.from("clasificacion_envases").delete().eq("id", id)
    if (error) return { error: error.message }
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

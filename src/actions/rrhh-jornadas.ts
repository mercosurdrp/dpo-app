"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type {
  RrhhJornadaPlantilla,
  RrhhJornadaAsignacion,
  RrhhJornadaAsignacionConPlantilla,
  RrhhJornadaExcepcion,
} from "@/types/database"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

// ===================================================
// Plantillas
// ===================================================
export async function listarJornadasPlantilla(): Promise<Result<RrhhJornadaPlantilla[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_jornadas_plantilla")
      .select("*")
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as RrhhJornadaPlantilla[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

interface PlantillaInput {
  nombre: string
  hora_entrada: string
  hora_salida: string
  tolerancia_minutos?: number
  horas_esperadas?: number
}

export async function crearJornadaPlantilla(
  input: PlantillaInput
): Promise<Result<{ id: string }>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    if (!input.nombre?.trim() || !input.hora_entrada || !input.hora_salida) {
      return { error: "Nombre, hora_entrada y hora_salida son obligatorios" }
    }
    const { data, error } = await supabase
      .from("rrhh_jornadas_plantilla")
      .insert({
        nombre: input.nombre.trim(),
        hora_entrada: input.hora_entrada,
        hora_salida: input.hora_salida,
        tolerancia_minutos: input.tolerancia_minutos ?? 10,
        horas_esperadas: input.horas_esperadas ?? 8,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/rrhh/jornadas")
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function actualizarJornadaPlantilla(
  id: string,
  input: Partial<PlantillaInput> & { activo?: boolean }
): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.nombre !== undefined) update.nombre = input.nombre.trim()
    if (input.hora_entrada !== undefined) update.hora_entrada = input.hora_entrada
    if (input.hora_salida !== undefined) update.hora_salida = input.hora_salida
    if (input.tolerancia_minutos !== undefined) update.tolerancia_minutos = input.tolerancia_minutos
    if (input.horas_esperadas !== undefined) update.horas_esperadas = input.horas_esperadas
    if (input.activo !== undefined) update.activo = input.activo
    const { error } = await supabase
      .from("rrhh_jornadas_plantilla")
      .update(update)
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/rrhh/jornadas")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Asignaciones
// ===================================================
export async function listarAsignaciones(empleadoId?: string): Promise<
  Result<RrhhJornadaAsignacionConPlantilla[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let query = supabase
      .from("rrhh_jornadas_asignacion")
      .select(
        `*,
        plantilla:rrhh_jornadas_plantilla!rrhh_jornadas_asignacion_jornada_id_fkey(*),
        empleado:empleados!rrhh_jornadas_asignacion_empleado_id_fkey(legajo, nombre)`
      )
      .order("vigente_desde", { ascending: false })

    if (empleadoId) query = query.eq("empleado_id", empleadoId)

    const { data, error } = await query
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: RrhhJornadaAsignacionConPlantilla[] = ((data ?? []) as any[]).map(
      (row) => ({
        id: row.id,
        empleado_id: row.empleado_id,
        jornada_id: row.jornada_id,
        vigente_desde: row.vigente_desde,
        vigente_hasta: row.vigente_hasta,
        dias_semana: row.dias_semana,
        created_at: row.created_at,
        plantilla: row.plantilla,
        empleado_nombre: row.empleado?.nombre ?? "?",
        empleado_legajo: row.empleado?.legajo ?? 0,
      })
    )
    return { data: enriched }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

interface AsignacionInput {
  empleado_id: string
  jornada_id: string
  vigente_desde: string
  vigente_hasta?: string | null
  dias_semana?: number[]
}

export async function asignarJornada(
  input: AsignacionInput
): Promise<Result<{ id: string }>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_jornadas_asignacion")
      .insert({
        empleado_id: input.empleado_id,
        jornada_id: input.jornada_id,
        vigente_desde: input.vigente_desde,
        vigente_hasta: input.vigente_hasta ?? null,
        dias_semana: input.dias_semana ?? [1, 2, 3, 4, 5],
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/rrhh/jornadas")
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function finalizarAsignacion(
  id: string,
  vigenteHasta: string
): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_jornadas_asignacion")
      .update({ vigente_hasta: vigenteHasta })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/rrhh/jornadas")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Excepciones puntuales
// ===================================================
interface ExcepcionInput {
  empleado_id: string
  fecha: string
  hora_entrada?: string | null
  hora_salida?: string | null
  motivo?: string | null
  no_laborable?: boolean
}

export async function crearExcepcion(
  input: ExcepcionInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_jornadas_excepcion")
      .upsert(
        {
          empleado_id: input.empleado_id,
          fecha: input.fecha,
          hora_entrada: input.hora_entrada ?? null,
          hora_salida: input.hora_salida ?? null,
          motivo: input.motivo?.trim() ?? null,
          no_laborable: input.no_laborable ?? false,
          created_by: profile.id,
        },
        { onConflict: "empleado_id,fecha" }
      )
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/asistencia")
    revalidatePath("/rrhh/jornadas")
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function listarExcepciones(
  desde: string,
  hasta: string,
  empleadoId?: string
): Promise<Result<RrhhJornadaExcepcion[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    let query = supabase
      .from("rrhh_jornadas_excepcion")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
    if (empleadoId) query = query.eq("empleado_id", empleadoId)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data ?? []) as RrhhJornadaExcepcion[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarExcepcion(id: string): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_jornadas_excepcion")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/rrhh/jornadas")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Helper: jornada esperada para un empleado en una fecha (consume RPC SQL).
// ===================================================
export async function obtenerJornadaEsperada(
  empleadoId: string,
  fecha: string
): Promise<
  Result<{
    hora_entrada: string | null
    hora_salida: string | null
    no_laborable: boolean
    fuente: "excepcion" | "plantilla" | "ninguna"
  }>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("rrhh_jornada_esperada", {
      p_empleado_id: empleadoId,
      p_fecha: fecha,
    })
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[]
    if (rows.length === 0) {
      return {
        data: {
          hora_entrada: null,
          hora_salida: null,
          no_laborable: false,
          fuente: "ninguna",
        },
      }
    }
    const r = rows[0]
    return {
      data: {
        hora_entrada: r.hora_entrada,
        hora_salida: r.hora_salida,
        no_laborable: r.no_laborable,
        fuente: r.fuente,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// Re-export para evitar warnings de TypeScript si no se usa el tipo en otro lado.
export type { RrhhJornadaAsignacion }

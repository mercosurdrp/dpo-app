"use server"

// Programación semanal de órdenes de trabajo (DPO Flota 2.2/2.4): lo que el
// Supervisor de Flota planea hacerle a cada unidad, con registro histórico y
// PDF imprimible para entregarle al taller/mecánico.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { createMantenimiento, updateMantenimiento } from "@/actions/mantenimiento-vehiculos"
import type { MantenimientoTipo } from "@/types/database"

export type OtProgramadaEstado =
  | "planificada"
  | "enviada"
  | "en_taller"
  | "realizada"
  | "cancelada"

export interface OtProgramada {
  id: string
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller: string
  notas: string
  estado: OtProgramadaEstado
  realizado_id: string | null
  created_at: string
  updated_at: string
}

type Result<T> = { data: T } | { error: string }

function normalizarTareas(tareas: string[]): string[] {
  return tareas.map((t) => t.trim()).filter(Boolean)
}

export async function getOtProgramadas(rango: {
  desde: string
  hasta: string
}): Promise<Result<OtProgramada[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .gte("fecha_programada", rango.desde)
      .lte("fecha_programada", rango.hasta)
      .order("fecha_programada")
      .order("dominio")
    if (error) return { error: error.message }
    return { data: (data || []) as OtProgramada[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createOtProgramada(input: {
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller?: string
  notas?: string
}): Promise<Result<OtProgramada>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const tareas = normalizarTareas(input.tareas)
    if (!input.dominio || !input.fecha_programada) {
      return { error: "Faltan unidad o fecha" }
    }
    if (tareas.length === 0) return { error: "Cargá al menos un trabajo a realizar" }
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .insert({
        dominio: input.dominio,
        fecha_programada: input.fecha_programada,
        tareas,
        taller: input.taller?.trim() ?? "",
        notas: input.notas?.trim() ?? "",
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateOtProgramada(input: {
  id: string
  fecha_programada?: string
  tareas?: string[]
  taller?: string
  notas?: string
  estado?: OtProgramadaEstado
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.fecha_programada) update.fecha_programada = input.fecha_programada
    if (input.tareas) {
      const tareas = normalizarTareas(input.tareas)
      if (tareas.length === 0) return { error: "Cargá al menos un trabajo a realizar" }
      update.tareas = tareas
    }
    if (input.taller !== undefined) update.taller = input.taller.trim()
    if (input.notas !== undefined) update.notas = input.notas.trim()
    if (input.estado) update.estado = input.estado
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .update(update)
      .eq("id", input.id)
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DE LA PROGRAMACIÓN A LA OT REAL ====================
//
// Antes había que cargar todo dos veces: la orden programada y después, a mano,
// la orden de trabajo realizada con los mismos datos. Ahora la programada ES la
// OT: cuando la unidad se lleva al taller se crea la orden real en estado
// "en taller" (queda fuera de servicio desde ese día), y cuando vuelve se cierra
// con el kilometraje, el costo y la factura.

/**
 * La unidad se llevó al taller: crea la OT real a partir de la programada y las
 * deja vinculadas (`realizado_id`).
 *
 * `tareaIds` son las tareas del PLAN preventivo que se van a hacer: sin ellas el
 * mantenimiento no descuenta del plan y el service sigue figurando pendiente.
 * Los trabajos que no están en el plan viajan como descripción libre.
 */
export async function llevarOtAlTaller(input: {
  id: string
  fecha: string
  tipo: MantenimientoTipo
  tareaIds?: string[]
  /** Nombre del plan de cada tarea elegida, para no repetirla como texto libre. */
  nombresDelPlan?: string[]
  odometro?: number | null
  horometro?: number | null
  /** Service general (rodado): reinicia el contador del próximo service. */
  esServiceGeneral?: boolean
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: prog, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .eq("id", input.id)
      .single()
    if (error || !prog) return { error: error?.message ?? "No se encontró la orden programada" }
    const ot = prog as OtProgramada
    if (ot.realizado_id) return { error: "Esta orden ya tiene una OT de trabajo asociada" }

    const delPlan = new Set((input.nombresDelPlan ?? []).map((n) => n.trim()))
    const tareas = [
      ...(input.tareaIds ?? []).map((tareaId) => ({ tareaId })),
      ...normalizarTareas(ot.tareas)
        .filter((t) => !delPlan.has(t))
        .map((descripcion) => ({ descripcion })),
      ...(input.esServiceGeneral ? [{ descripcion: "Service general (rodado)" }] : []),
    ]
    if (tareas.length === 0) return { error: "La orden no tiene trabajos cargados" }

    const res = await createMantenimiento({
      dominio: ot.dominio,
      fecha: input.fecha,
      tipo: input.tipo,
      estado: "en_taller",
      entrada_taller: input.fecha,
      odometro: input.odometro ?? null,
      horometro: input.horometro ?? null,
      taller: ot.taller || undefined,
      observaciones: ot.notas || undefined,
      es_service_general: input.esServiceGeneral ?? false,
      tareas,
    })
    if ("error" in res) return { error: res.error }

    const { data, error: upErr } = await supabase
      .from("mantenimiento_ot_programadas")
      .update({ estado: "en_taller", realizado_id: res.data.id })
      .eq("id", input.id)
      .select("*")
      .single()
    if (upErr) return { error: upErr.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Volvió la unidad: cierra la OT real (pasa a completada y vuelve a servicio) y
 * marca la programada como realizada. Acá recién se cargan el kilometraje de
 * salida, el costo y la factura.
 */
export async function cerrarOtProgramada(input: {
  id: string
  fechaSalida: string
  odometro?: number | null
  horometro?: number | null
  costo?: number | null
  numero_factura?: string
  observaciones?: string
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: prog, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .eq("id", input.id)
      .single()
    if (error || !prog) return { error: error?.message ?? "No se encontró la orden programada" }
    const ot = prog as OtProgramada
    if (!ot.realizado_id) {
      return { error: "La orden todavía no se llevó al taller: no hay OT que cerrar" }
    }

    const res = await updateMantenimiento({
      id: ot.realizado_id,
      estado: "completado",
      salida_taller: input.fechaSalida,
      // El odómetro de la salida es el que usa el plan para contar el próximo
      // vencimiento: sin él la tarea queda hecha pero sin kilometraje de corte.
      ...(input.odometro != null ? { odometro: input.odometro } : {}),
      ...(input.horometro != null ? { horometro: input.horometro } : {}),
      ...(input.costo != null ? { costo: input.costo } : {}),
      ...(input.numero_factura ? { numero_factura: input.numero_factura } : {}),
      ...(input.observaciones ? { observaciones: input.observaciones } : {}),
    })
    if ("error" in res) return { error: res.error }

    const { data, error: upErr } = await supabase
      .from("mantenimiento_ot_programadas")
      .update({ estado: "realizada" })
      .eq("id", input.id)
      .select("*")
      .single()
    if (upErr) return { error: upErr.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteOtProgramada(id: string): Promise<
  { success: true } | { error: string }
> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_ot_programadas")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

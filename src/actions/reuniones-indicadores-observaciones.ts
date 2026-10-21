"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  EstadoReunionActividad,
  ReunionActividadConResponsable,
  ReunionIndicadorObservacion,
  ReunionIndicadorObservacionConAutor,
  TipoReunion,
} from "@/types/database"

// =============================================
// Tablero de control (Etapa 3) · Observaciones por indicador
//
// Debajo del tablero de las reuniones de Logística, Warehouse y Matinal
// Distribución se registran observaciones sobre un indicador (no cumplió,
// pasó algo). Al hacer clic en el nombre del indicador se abre su historial:
// todas las observaciones y las actividades del Action Log atadas a ese
// indicador, en cualquier reunión del mismo tipo.
// =============================================

type Result<T> = { data: T } | { error: string }

const REVALIDATE_PATH = "/reuniones"

async function requireEditor() {
  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) {
    throw new Error("No tenés permiso para editar reuniones")
  }
  return profile
}

/** Observaciones + actividades por indicador, contadas para marcar la fila del tablero. */
export interface IndicadorHistorialResumen {
  observaciones: number
  /** Actividades atadas al indicador que todavía no se cerraron. */
  acciones_abiertas: number
  acciones: number
}

export interface IndicadorHistorial {
  observaciones: ReunionIndicadorObservacionConAutor[]
  actividades: ReunionActividadConResponsable[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapObservacion(r: Record<string, any>): ReunionIndicadorObservacionConAutor {
  return {
    id: r.id,
    reunion_id: r.reunion_id,
    indicador_id: r.indicador_id,
    indicador_nombre: r.indicador_nombre,
    texto: r.texto,
    created_by: r.created_by ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    autor_nombre: r.autor?.nombre ?? null,
    reunion_fecha: r.reunion?.fecha ?? "",
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapActividad(r: Record<string, any>): ReunionActividadConResponsable {
  return {
    id: r.id,
    reunion_id: r.reunion_id,
    descripcion: r.descripcion,
    motivo: r.motivo ?? null,
    responsable_id: r.responsable_id ?? null,
    fecha_compromiso: r.fecha_compromiso ?? null,
    estado: r.estado as EstadoReunionActividad,
    evidencia_url: r.evidencia_url ?? null,
    evidencia_nombre: r.evidencia_nombre ?? null,
    observaciones: r.observaciones ?? null,
    completado_at: r.completado_at ?? null,
    created_by: r.created_by ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    destino: r.destino ?? "simple",
    s5_sector_numero: r.s5_sector_numero ?? null,
    s5_vehiculo_id: r.s5_vehiculo_id ?? null,
    mantenimiento_rubro: r.mantenimiento_rubro ?? null,
    seccion: r.seccion ?? null,
    indicador_id: r.indicador_id ?? null,
    indicador_nombre: r.indicador_nombre ?? null,
    responsable_nombre: r.responsable?.nombre ?? null,
    reunion_origen_id: r.reunion_origen?.id ?? r.reunion_id,
    reunion_origen_fecha: r.reunion_origen?.fecha ?? "",
  }
}

const SELECT_OBS =
  "*, autor:profiles!reuniones_indicadores_observaciones_created_by_fkey(id, nombre), reunion:reuniones!reuniones_indicadores_observaciones_reunion_id_fkey(id, fecha, tipo)"

const SELECT_ACT =
  "*, responsable:profiles!reuniones_actividades_responsable_id_fkey(id, nombre), reunion_origen:reuniones!reuniones_actividades_reunion_id_fkey!inner(id, fecha, tipo)"

/** Observaciones cargadas en una reunión (las que se listan debajo del tablero). */
export async function listObservacionesReunion(
  reunionId: string,
): Promise<Result<ReunionIndicadorObservacionConAutor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reuniones_indicadores_observaciones")
      .select(SELECT_OBS)
      .eq("reunion_id", reunionId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: (data ?? []).map((r) => mapObservacion(r as any)) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando observaciones" }
  }
}

/**
 * Cuántas observaciones y acciones tiene cada indicador del tipo de reunión,
 * para marcar en el tablero los que tienen historial.
 */
export async function getResumenHistorialIndicadores(
  tipo: TipoReunion,
): Promise<Result<Record<string, IndicadorHistorialResumen>>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [obsRes, actRes] = await Promise.all([
      supabase
        .from("reuniones_indicadores_observaciones")
        .select("indicador_id, reunion:reuniones!reuniones_indicadores_observaciones_reunion_id_fkey!inner(tipo)")
        .eq("reunion.tipo", tipo),
      supabase
        .from("reuniones_actividades")
        .select("indicador_id, estado, reunion_origen:reuniones!reuniones_actividades_reunion_id_fkey!inner(tipo)")
        .not("indicador_id", "is", null)
        .eq("reunion_origen.tipo", tipo),
    ])
    if (obsRes.error) return { error: obsRes.error.message }
    if (actRes.error) return { error: actRes.error.message }

    const out: Record<string, IndicadorHistorialResumen> = {}
    const get = (id: string) =>
      (out[id] ??= { observaciones: 0, acciones_abiertas: 0, acciones: 0 })
    for (const r of (obsRes.data ?? []) as Array<{ indicador_id: string }>) {
      get(r.indicador_id).observaciones += 1
    }
    for (const r of (actRes.data ?? []) as Array<{
      indicador_id: string | null
      estado: EstadoReunionActividad
    }>) {
      if (!r.indicador_id) continue
      const c = get(r.indicador_id)
      c.acciones += 1
      if (r.estado !== "cerrada") c.acciones_abiertas += 1
    }
    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando historial" }
  }
}

/**
 * Historial completo de un indicador: observaciones y actividades atadas a él
 * en todas las reuniones del mismo tipo, de la más nueva a la más vieja.
 */
export async function getHistorialIndicador(
  tipo: TipoReunion,
  indicadorId: string,
): Promise<Result<IndicadorHistorial>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [obsRes, actRes] = await Promise.all([
      supabase
        .from("reuniones_indicadores_observaciones")
        .select(SELECT_OBS.replace("(id, fecha, tipo)", "!inner(id, fecha, tipo)"))
        .eq("indicador_id", indicadorId)
        .eq("reunion.tipo", tipo)
        .order("created_at", { ascending: false }),
      supabase
        .from("reuniones_actividades")
        .select(SELECT_ACT)
        .eq("indicador_id", indicadorId)
        .eq("reunion_origen.tipo", tipo)
        .order("created_at", { ascending: false }),
    ])
    if (obsRes.error) return { error: obsRes.error.message }
    if (actRes.error) return { error: actRes.error.message }

    const observaciones = (obsRes.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => mapObservacion(r as any))
      .sort((a, b) =>
        a.reunion_fecha === b.reunion_fecha
          ? b.created_at.localeCompare(a.created_at)
          : b.reunion_fecha.localeCompare(a.reunion_fecha),
      )
    const actividades = (actRes.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => mapActividad(r as any))
      .sort((a, b) =>
        a.reunion_origen_fecha === b.reunion_origen_fecha
          ? b.created_at.localeCompare(a.created_at)
          : b.reunion_origen_fecha.localeCompare(a.reunion_origen_fecha),
      )
    return { data: { observaciones, actividades } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando historial" }
  }
}

export async function crearObservacionIndicador(input: {
  reunionId: string
  indicadorId: string
  indicadorNombre: string
  texto: string
}): Promise<Result<ReunionIndicadorObservacion>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()

    const texto = input.texto.trim()
    const indicadorId = input.indicadorId.trim()
    const indicadorNombre = input.indicadorNombre.trim()
    if (!input.reunionId) return { error: "La reunión es obligatoria" }
    if (!indicadorId || !indicadorNombre) return { error: "Elegí el indicador" }
    if (!texto) return { error: "Escribí la observación" }

    const { data, error } = await supabase
      .from("reuniones_indicadores_observaciones")
      .insert({
        reunion_id: input.reunionId,
        indicador_id: indicadorId,
        indicador_nombre: indicadorNombre,
        texto,
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }

    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionIndicadorObservacion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la observación" }
  }
}

export async function actualizarObservacionIndicador(
  id: string,
  texto: string,
): Promise<Result<ReunionIndicadorObservacion>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const t = texto.trim()
    if (!id) return { error: "ID inválido" }
    if (!t) return { error: "Escribí la observación" }
    const { data, error } = await supabase
      .from("reuniones_indicadores_observaciones")
      .update({ texto: t })
      .eq("id", id)
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { data: data as ReunionIndicadorObservacion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la observación" }
  }
}

export async function eliminarObservacionIndicador(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()
    if (!id) return { error: "ID inválido" }
    const { error } = await supabase
      .from("reuniones_indicadores_observaciones")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(REVALIDATE_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando la observación" }
  }
}

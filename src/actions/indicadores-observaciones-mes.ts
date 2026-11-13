"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { getHistorialIndicador } from "@/actions/reuniones-indicadores-observaciones"

// =============================================
// Seguimiento mensual de un indicador (página del indicador, ej. /indicadores/dqi)
//
// Para dejar evidencia de los meses que no cumplieron el target: observaciones
// cargadas desde la página (atadas a un mes) + lo que ya se registró sobre el
// mismo indicador en las reuniones (observaciones y acciones del tablero de la
// matinal de Logística), agrupado por el mes de la reunión.
// =============================================

type Result<T> = { data: T } | { error: string }

const ROLES_EDITOR = ["admin", "supervisor", "admin_rrhh"]
const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export interface ObservacionMes {
  id: string
  /** 'YYYY-MM' */
  periodo: string
  texto: string
  autor_nombre: string | null
  created_at: string
  /** pagina = cargada en la página del indicador; reunion = tablero de una reunión. */
  origen: "pagina" | "reunion"
  reunion_id?: string
  reunion_fecha?: string
  reunion_tipo?: string
}

export interface AccionReunionMes {
  id: string
  periodo: string
  descripcion: string
  estado: "no_comenzada" | "en_curso" | "cerrada"
  responsable_nombre: string | null
  fecha_compromiso: string | null
  reunion_id: string
  reunion_fecha: string
  reunion_tipo?: string
}

export interface SeguimientoMensual {
  observaciones: ObservacionMes[]
  acciones: AccionReunionMes[]
}

/**
 * Observaciones de la página + observaciones/acciones de las reuniones sobre el
 * indicador, del año pedido. `indicadorReunionId` es la clave del indicador en
 * el tablero de las reuniones (ej. 'auto_dqi').
 */
export async function getSeguimientoMensual(input: {
  indicador: string
  indicadorReunionId?: string
  year: number
}): Promise<Result<SeguimientoMensual>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const desde = `${input.year}-01`
    const hasta = `${input.year}-12`
    const { data, error } = await supabase
      .from("indicadores_observaciones_mes")
      .select("id, periodo, texto, created_at, autor:profiles!indicadores_observaciones_mes_created_by_fkey(nombre)")
      .eq("indicador", input.indicador)
      .gte("periodo", desde)
      .lte("periodo", hasta)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const observaciones: ObservacionMes[] = (data ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const autor = (r as any).autor
      return {
        id: r.id as string,
        periodo: r.periodo as string,
        texto: r.texto as string,
        autor_nombre: (Array.isArray(autor) ? autor[0]?.nombre : autor?.nombre) ?? null,
        created_at: r.created_at as string,
        origen: "pagina" as const,
      }
    })
    const acciones: AccionReunionMes[] = []

    if (input.indicadorReunionId) {
      const hist = await getHistorialIndicador("logistica", input.indicadorReunionId, {
        todasLasReuniones: true,
      })
      if ("data" in hist) {
        for (const o of hist.data.observaciones) {
          const periodo = (o.reunion_fecha ?? "").slice(0, 7)
          if (!periodo.startsWith(String(input.year))) continue
          observaciones.push({
            id: o.id,
            periodo,
            texto: o.texto,
            autor_nombre: o.autor_nombre,
            created_at: o.created_at,
            origen: "reunion",
            reunion_id: o.reunion_id,
            reunion_fecha: o.reunion_fecha,
            reunion_tipo: o.reunion_tipo,
          })
        }
        for (const a of hist.data.actividades) {
          const periodo = (a.reunion_origen_fecha ?? "").slice(0, 7)
          if (!periodo.startsWith(String(input.year))) continue
          acciones.push({
            id: a.id,
            periodo,
            descripcion: a.descripcion,
            estado: a.estado,
            responsable_nombre: a.responsable_nombre ?? null,
            fecha_compromiso: a.fecha_compromiso ?? null,
            reunion_id: a.reunion_origen_id,
            reunion_fecha: a.reunion_origen_fecha,
            reunion_tipo: a.reunion_origen_tipo,
          })
        }
      }
    }

    observaciones.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return { data: { observaciones, acciones } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el seguimiento mensual" }
  }
}

async function requireEditor() {
  const profile = await requireAuth()
  if (!ROLES_EDITOR.includes(profile.role)) {
    throw new Error("No tenés permiso para cargar observaciones")
  }
  return profile
}

export async function crearObservacionMes(input: {
  indicador: string
  periodo: string
  texto: string
  revalidar?: string
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireEditor()
    if (!PERIODO_RE.test(input.periodo)) return { error: "Mes inválido." }
    const texto = input.texto.trim()
    if (!texto) return { error: "Escribí la observación." }
    const supabase = await createClient()
    const { error } = await supabase.from("indicadores_observaciones_mes").insert({
      indicador: input.indicador,
      periodo: input.periodo,
      texto,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    if (input.revalidar) revalidatePath(input.revalidar)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la observación" }
  }
}

export async function actualizarObservacionMes(
  id: string,
  texto: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireEditor()
    const t = texto.trim()
    if (!t) return { error: "Escribí la observación." }
    const supabase = await createClient()
    const { error } = await supabase
      .from("indicadores_observaciones_mes")
      .update({ texto: t, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la observación" }
  }
}

export async function eliminarObservacionMes(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const { error } = await supabase.from("indicadores_observaciones_mes").delete().eq("id", id)
    if (error) return { error: error.message }
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando la observación" }
  }
}

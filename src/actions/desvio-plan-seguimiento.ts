"use server"

/**
 * Observaciones y planes de acción del indicador "Desvío s/ tiempo
 * planificado" (página /indicadores/desvio-plan, DPO Entrega 2.1).
 *
 * No hay tabla propia: se guardan en la Matinal de Distribución del día,
 * atados al indicador del tablero (`auto_fx_desvio_plan`):
 *  - observación → reuniones_indicadores_observaciones
 *  - plan de acción → reuniones_actividades (Action Log de la matinal)
 * Así lo cargado desde el indicador aparece también en el historial del
 * tablero de la matinal y en su Action Log, y viceversa.
 */
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  crearObservacionIndicador,
  getHistorialIndicador,
  type IndicadorHistorial,
} from "@/actions/reuniones-indicadores-observaciones"
import { crearActividad, listResponsablesPosibles } from "@/actions/reuniones"

type Result<T> = { data: T } | { error: string }

const TIPO_REUNION = "matinal-distribucion"
const INDICADOR_ID = "auto_fx_desvio_plan"
const INDICADOR_NOMBRE = "Desvío s/ tiempo planificado"
const PAGINA = "/indicadores/desvio-plan"
const EDITORES = ["admin", "supervisor", "admin_rrhh"]

export interface SeguimientoDesvioPlan {
  historial: IndicadorHistorial
  responsables: { id: string; nombre: string }[]
  puedeEditar: boolean
}

export async function getSeguimientoDesvioPlan(): Promise<Result<SeguimientoDesvioPlan>> {
  try {
    const profile = await requireAuth()
    if (IS_MISIONES) return { error: "Solo disponible en Pampeana" }
    const [hist, resp] = await Promise.all([
      getHistorialIndicador(TIPO_REUNION, INDICADOR_ID),
      listResponsablesPosibles(),
    ])
    if ("error" in hist) return { error: hist.error }
    return {
      data: {
        historial: hist.data,
        responsables: "error" in resp ? [] : resp.data.map((p) => ({ id: p.id, nombre: p.nombre })),
        puedeEditar: EDITORES.includes(profile.role),
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el seguimiento" }
  }
}

/** Matinal de Distribución de esa fecha (la que genera la app cada día). */
async function matinalDelDia(fecha: string): Promise<Result<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reuniones")
    .select("id")
    .eq("tipo", TIPO_REUNION)
    .eq("fecha", fecha)
    .order("created_at")
    .limit(1)
  if (error) return { error: error.message }
  const id = (data?.[0] as { id: string } | undefined)?.id
  if (!id) {
    return {
      error: `No hay Matinal de Distribución el ${fecha.split("-").reverse().join("/")}. Elegí un día con matinal.`,
    }
  }
  return { data: id }
}

export async function cargarSeguimientoDesvioPlan(input: {
  tipo: "observacion" | "plan"
  fecha: string
  texto: string
  /** Solo plan: causa / motivo del desvío. */
  motivo?: string
  responsableId?: string
  fechaCompromiso?: string
}): Promise<{ ok: true } | { error: string }> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: "Solo disponible en Pampeana" }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { error: "Fecha inválida" }
    const texto = input.texto.trim()
    if (!texto) {
      return { error: input.tipo === "plan" ? "Escribí la acción" : "Escribí la observación" }
    }
    const reunion = await matinalDelDia(input.fecha)
    if ("error" in reunion) return { error: reunion.error }

    if (input.tipo === "observacion") {
      const res = await crearObservacionIndicador({
        reunionId: reunion.data,
        indicadorId: INDICADOR_ID,
        indicadorNombre: INDICADOR_NOMBRE,
        texto,
      })
      if ("error" in res) return { error: res.error }
    } else {
      if (!input.responsableId) return { error: "Elegí el responsable" }
      const fd = new FormData()
      fd.set("reunion_id", reunion.data)
      fd.set("descripcion", texto)
      if (input.motivo?.trim()) fd.set("motivo", input.motivo.trim())
      fd.set("responsable_id", input.responsableId)
      if (input.fechaCompromiso) fd.set("fecha_compromiso", input.fechaCompromiso)
      fd.set("indicador_id", INDICADOR_ID)
      fd.set("indicador_nombre", INDICADOR_NOMBRE)
      fd.set("destino", "simple")
      const res = await crearActividad(fd)
      if ("error" in res) return { error: res.error }
    }
    revalidatePath(PAGINA)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando" }
  }
}

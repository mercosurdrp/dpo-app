import type { createClient } from "@/lib/supabase/server"
import { horasEntre, type PlanEstado, type PlanResumen } from "./tiempo-resolucion"

type Supa = Awaited<ReturnType<typeof createClient>>

const COLUMNAS_OT =
  "respuesta_id, tipo, estado, descripcion, resuelto_at, ot_id, updated_at"
/** Mismo select sin la OT asociada, por si esa migración no está aplicada. */
const COLUMNAS = "respuesta_id, tipo, estado, descripcion, resuelto_at, updated_at"
/** Mismo select sin resuelto_at, para el caso de que la migración no esté aplicada todavía. */
const COLUMNAS_LEGACY = "respuesta_id, tipo, estado, descripcion, updated_at"

interface PlanRow {
  respuesta_id: string
  tipo: string
  estado: PlanEstado
  descripcion: string
  resuelto_at?: string | null
  ot_id?: string | null
  updated_at: string
}

/**
 * Planes de acción de un conjunto de respuestas de checklist, indexados por
 * `respuesta_id`. Si el plan está resuelto se calcula el tiempo de respuesta
 * contra la hora del checklist que pasa el llamador en `horaPorRespuesta`.
 *
 * Tolera que la columna `resuelto_at` todavía no exista en la base (el DDL se
 * aplica a mano en el SQL Editor): en ese caso cae a `updated_at`, que es la
 * mejor aproximación disponible, en vez de romper la pantalla.
 */
export async function fetchPlanesPorRespuesta(
  supa: Supa,
  respuestaIds: string[],
  horaPorRespuesta?: Map<string, string>,
): Promise<Map<string, PlanResumen>> {
  const out = new Map<string, PlanResumen>()
  if (respuestaIds.length === 0) return out

  // Cascada: OT → resuelto_at → legacy. 42703 = columna inexistente ⇒ base sin
  // esa migración aplicada, así que se prueba el select anterior.
  let rows: PlanRow[] = []
  for (const [i, columnas] of [COLUMNAS_OT, COLUMNAS, COLUMNAS_LEGACY].entries()) {
    const { data, error } = await supa
      .from("checklist_planes_accion")
      .select(columnas)
      .in("respuesta_id", respuestaIds)
    if (!error) {
      rows = (data ?? []) as unknown as PlanRow[]
      break
    }
    if (error.code !== "42703" || i === 2) throw new Error(error.message)
  }

  // N° de la OT de los planes que derivaron en una orden: es lo que se muestra
  // al lado del rechazo, y el id solo no le dice nada a nadie.
  const otIds = [...new Set(rows.map((p) => p.ot_id).filter((id): id is string => !!id))]
  const numeroPorOt = new Map<string, string | null>()
  if (otIds.length > 0) {
    const { data: ots } = await supa
      .from("mantenimiento_realizados")
      .select("id, numero_ot")
      .in("id", otIds)
    for (const o of ((ots ?? []) as unknown as { id: string; numero_ot: string | null }[])) {
      numeroPorOt.set(o.id, o.numero_ot)
    }
  }

  for (const p of rows) {
    const resueltoAt =
      p.estado === "resuelto" ? (p.resuelto_at ?? p.updated_at ?? null) : null
    out.set(p.respuesta_id, {
      estado: p.estado,
      tipo: p.tipo,
      descripcion: p.descripcion,
      resueltoAt,
      horasResolucion: horasEntre(horaPorRespuesta?.get(p.respuesta_id), resueltoAt),
      otId: p.ot_id ?? null,
      otNumero: p.ot_id ? (numeroPorOt.get(p.ot_id) ?? null) : null,
    })
  }
  return out
}

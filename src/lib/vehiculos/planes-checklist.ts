import type { createClient } from "@/lib/supabase/server"
import { horasEntre, type PlanEstado, type PlanResumen } from "./tiempo-resolucion"

type Supa = Awaited<ReturnType<typeof createClient>>

const COLUMNAS = "respuesta_id, tipo, estado, descripcion, resuelto_at, updated_at"
/** Mismo select sin resuelto_at, para el caso de que la migración no esté aplicada todavía. */
const COLUMNAS_LEGACY = "respuesta_id, tipo, estado, descripcion, updated_at"

interface PlanRow {
  respuesta_id: string
  tipo: string
  estado: PlanEstado
  descripcion: string
  resuelto_at?: string | null
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

  let rows: PlanRow[] = []
  const { data, error } = await supa
    .from("checklist_planes_accion")
    .select(COLUMNAS)
    .in("respuesta_id", respuestaIds)
  if (error) {
    // 42703 = columna inexistente ⇒ base sin la migración aplicada.
    if (error.code !== "42703") throw new Error(error.message)
    const legacy = await supa
      .from("checklist_planes_accion")
      .select(COLUMNAS_LEGACY)
      .in("respuesta_id", respuestaIds)
    if (legacy.error) throw new Error(legacy.error.message)
    rows = (legacy.data ?? []) as unknown as PlanRow[]
  } else {
    rows = (data ?? []) as unknown as PlanRow[]
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
    })
  }
  return out
}

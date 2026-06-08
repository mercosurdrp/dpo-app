"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

export type PlanTableroEstado = "pendiente" | "en_curso" | "terminado"

export interface PlanTableroFila {
  id: string
  reporte_id: string
  reporte_tipo: string | null
  reporte_fecha: string
  reporte_descripcion: string | null
  plan_descripcion: string
  responsable_nombre: string | null
  responsable_id: string | null
  fecha_planificada: string | null
  fecha_completado: string | null
  estado: PlanTableroEstado
  created_at: string
}

function estadoPlan(
  fecha_planificada: string | null,
  fecha_completado: string | null,
): PlanTableroEstado {
  if (fecha_completado) return "terminado"
  if (fecha_planificada) return "en_curso"
  return "pendiente"
}

// La solapa "Planes de acción" lista los planes de acción de los reportes
// (reporte_seguridad_planes). Cuando se aplica una herramienta de gestión y se
// marca la contramedida como completada, esta vuelca al plan del reporte (1:1),
// así que el plan es la única representación acá: la herramienta en sí se ve
// dentro del reporte, no como una fila aparte.
export async function getReportePlanesTablero(): Promise<Result<PlanTableroFila[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("reporte_seguridad_planes")
      .select(
        `id, reporte_id, descripcion, fecha_planificada, fecha_completado, creado_por, created_at,
         reporte:reportes_seguridad!reporte_seguridad_planes_reporte_id_fkey(id, tipo, fecha, descripcion),
         autor:profiles!reporte_seguridad_planes_creado_por_fkey(id, nombre)`,
      )
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const filas: PlanTableroFila[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (data ?? []) as any[]) {
      const reporte = row.reporte
      if (!reporte) continue
      filas.push({
        id: row.id,
        reporte_id: row.reporte_id,
        reporte_tipo: reporte.tipo ?? null,
        reporte_fecha: reporte.fecha,
        reporte_descripcion: reporte.descripcion ?? null,
        plan_descripcion: row.descripcion ?? "",
        responsable_nombre: row.autor?.nombre ?? null,
        responsable_id: row.autor?.id ?? row.creado_por ?? null,
        fecha_planificada: row.fecha_planificada ?? null,
        fecha_completado: row.fecha_completado ?? null,
        estado: estadoPlan(row.fecha_planificada, row.fecha_completado),
        created_at: row.created_at,
      })
    }

    return { data: filas }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el tablero de planes",
    }
  }
}

/** Fetch de una orden de trabajo (con tareas y repuestos) para las descargas Excel/PDF. */
import { createClient } from "@/lib/supabase/server"
import type { MantenimientoRealizado, MantenimientoTipo } from "@/types/database"

export const TIPO_OT_LABELS: Record<MantenimientoTipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  proactivo: "Proactivo",
}

export interface OrdenExport {
  orden: MantenimientoRealizado
  /** Nombre de las tareas del plan referenciadas por tarea_id. */
  nombresTareas: Map<string, string>
}

export async function fetchOrdenExport(id: string): Promise<OrdenExport | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("mantenimiento_realizados")
    .select(
      "*, tareas:mantenimiento_realizado_tareas(*), repuestos:mantenimiento_realizado_repuestos(*), facturas:mantenimiento_realizado_facturas(*)"
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const orden = data as MantenimientoRealizado

  const nombresTareas = new Map<string, string>()
  const ids = (orden.tareas ?? [])
    .map((t) => t.tarea_id)
    .filter((x): x is string => !!x)
  if (ids.length > 0) {
    const { data: plan, error: planError } = await supabase
      .from("mantenimiento_plan_tareas")
      .select("id, nombre")
      .in("id", ids)
    if (planError) throw new Error(planError.message)
    for (const t of (plan ?? []) as Array<{ id: string; nombre: string }>) {
      nombresTareas.set(t.id, t.nombre)
    }
  }
  return { orden, nombresTareas }
}

/** Descripción legible de una línea de trabajo (tarea del plan o libre). */
export function descTarea(
  t: { tarea_id: string | null; descripcion: string | null },
  nombres: Map<string, string>
): string {
  return (t.tarea_id ? nombres.get(t.tarea_id) : null) ?? t.descripcion ?? "Tarea"
}

/** Σ cantidad × costo unitario de los repuestos con precio. */
export function subtotalRepuestos(orden: MantenimientoRealizado): number {
  return (orden.repuestos ?? []).reduce(
    (a, r) => a + (r.costo_unitario != null ? Number(r.cantidad) * Number(r.costo_unitario) : 0),
    0
  )
}

export function nombreArchivoOt(orden: MantenimientoRealizado, ext: string): string {
  const num = orden.numero_ot ? `-${orden.numero_ot}` : ""
  return `ot${num}-${orden.dominio}.${ext}`
}

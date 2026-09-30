/**
 * «Tus capacitaciones» — avance de cada persona en las capacitaciones que
 * tiene asignadas, para «Cómo venimos» (pedido de Gustavo, 29/09/2026).
 *
 * Mismo criterio que «Mis capacitaciones», así los dos números coinciden:
 *   asignada  → tiene fila en `asistencias` y la capacitación es visible
 *               (las ocultas tampoco las ve en su pantalla). Las canceladas
 *               no cuentan.
 *   completa  → `resultado = aprobado`.
 *   pendiente → sin rendir o desaprobada (puede volver a rendir).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { EstadoCapacitacion, ResultadoCapacitacion } from "@/types/database"

export interface CapacitacionPendiente {
  id: string
  titulo: string
  fecha: string | null
  resultado: Exclude<ResultadoCapacitacion, "aprobado">
}

export interface MiAvanceCapacitaciones {
  total: number
  aprobadas: number
  /** Las que le faltan, las más viejas primero: son las más atrasadas. */
  pendientes: CapacitacionPendiente[]
}

type Row = {
  resultado: ResultadoCapacitacion
  capacitacion: {
    id: string
    titulo: string
    fecha: string | null
    visible: boolean
    estado: EstadoCapacitacion
  } | null
}

export async function buildAvanceCapacitaciones(
  supabase: SupabaseClient,
  empleadoId: string,
): Promise<MiAvanceCapacitaciones> {
  const { data, error } = await supabase
    .from("asistencias")
    .select("resultado, capacitacion:capacitaciones(id, titulo, fecha, visible, estado)")
    .eq("empleado_id", empleadoId)
  if (error) throw new Error(error.message)

  const asignadas = ((data ?? []) as unknown as Row[]).filter(
    (r) => r.capacitacion?.visible && r.capacitacion.estado !== "cancelada",
  )

  const pendientes: CapacitacionPendiente[] = asignadas
    .filter((r) => r.resultado !== "aprobado")
    .map((r) => ({
      id: r.capacitacion!.id,
      titulo: r.capacitacion!.titulo,
      fecha: r.capacitacion!.fecha,
      resultado: r.resultado as CapacitacionPendiente["resultado"],
    }))
    .sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"))

  return {
    total: asignadas.length,
    aprobadas: asignadas.length - pendientes.length,
    pendientes,
  }
}

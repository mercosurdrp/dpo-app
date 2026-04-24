import type { EstadoCapacitacion } from "@/types/database"

export interface CapacitacionEstadoInput {
  estado: EstadoCapacitacion
  fecha: string
  total_asistentes: number
  presentes: number
  rendidos: number
  pendientes: number
}

export function estadoDerivado(
  c: CapacitacionEstadoInput,
  today: string = new Date().toISOString().slice(0, 10)
): EstadoCapacitacion {
  if (c.estado === "cancelada" || c.estado === "completada") return c.estado
  if (c.total_asistentes === 0) {
    return c.fecha <= today ? "en_curso" : "programada"
  }
  if (c.pendientes === 0) return "completada"
  if (c.presentes > 0 || c.rendidos > 0 || c.fecha <= today) return "en_curso"
  return "programada"
}

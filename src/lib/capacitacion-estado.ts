import type { EstadoCapacitacion } from "@/types/database"

export interface CapacitacionEstadoInput {
  estado: EstadoCapacitacion
  fecha: string
  total_asistentes: number
  presentes: number
  rendidos: number
  pendientes: number
}

/**
 * Formatea una duración en horas (decimal) a un texto amigable.
 * 0.5 -> "30 min", 1 -> "1 h", 1.5 -> "1 h 30 min", 2 -> "2 h".
 */
export function formatDuracion(duracionHoras: number | null | undefined): string {
  const horas = Number(duracionHoras)
  if (!Number.isFinite(horas) || horas <= 0) return "-"
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  if (h === 0) return `${min} min`
  if (min === 0) return `${h} h`
  return `${h} h ${min} min`
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

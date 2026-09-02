import type { EstadoCapacitacion } from "@/types/database"

export interface CapacitacionEstadoInput {
  estado: EstadoCapacitacion
  total_asistentes: number
  aprobados: number
  /** Ya no entran en el estado; se dejan por compatibilidad con los llamadores. */
  fecha?: string | null
  presentes?: number
  rendidos?: number
  pendientes?: number
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

/** A partir de este avance la capacitación se da por cumplida. */
export const UMBRAL_CUMPLIDA = 0.9
export const UMBRAL_CUMPLIDA_PCT = Math.round(UMBRAL_CUMPLIDA * 100)

/**
 * Avance de la capacitación, 0-100: qué porcentaje de sus asistentes aprobó.
 * Es el mismo número que muestra la tarjeta ("88 % aprobados 7/8").
 */
export function pctAvance(c: Pick<CapacitacionEstadoInput, "total_asistentes" | "aprobados">): number {
  if (!c.total_asistentes) return 0
  return (c.aprobados / c.total_asistentes) * 100
}

/**
 * Estado real de una capacitación. Por defecto lo define el avance
 * (pedido del usuario, 2026-09-02):
 *
 * - **≥ 90 % aprobados → Completada.**
 * - **entre 1 % y 89 % → En curso.**
 * - **0 % (nadie aprobó todavía, o sin asistentes) → Pendiente**, aunque la
 *   fecha ya haya pasado: antes esas se mostraban "en curso" sólo por la
 *   fecha y tapaban que no las había arrancado nadie.
 *
 * Dos marcas cargadas a mano pisan ese cálculo:
 * - **Cancelada**: una capacitación dada de baja no vuelve sola.
 * - **Completada**: el **cierre manual** — se dictó y se da por cumplida
 *   aunque el examen no llegue al umbral (pedido del usuario, 2026-09-02).
 *   No es lo mismo que una cumplida por avance, así que la pantalla y el
 *   Excel la marcan como manual (`esCierreManual`).
 */
export function estadoDerivado(c: CapacitacionEstadoInput): EstadoCapacitacion {
  if (c.estado === "cancelada") return "cancelada"
  if (c.estado === "completada") return "completada"
  // Se compara el porcentaje REDONDEADO, que es el que se ve en pantalla: si la
  // tarjeta dice "90 % aprobados" tiene que estar cumplida (44/49 = 89,8 % se
  // muestra como 90 %, y quedaba En curso).
  const pct = Math.round(pctAvance(c))
  if (pct >= UMBRAL_CUMPLIDA_PCT) return "completada"
  return pct > 0 ? "en_curso" : "programada"
}

/**
 * Cumplida porque alguien la cerró a mano, no porque el avance llegue al
 * umbral. Si además llega al 90 % la marca no aporta nada, así que no se
 * muestra: sólo interesa señalar las que se dan por cumplidas sin llegar.
 */
export function esCierreManual(c: CapacitacionEstadoInput): boolean {
  return c.estado === "completada" && Math.round(pctAvance(c)) < UMBRAL_CUMPLIDA_PCT
}

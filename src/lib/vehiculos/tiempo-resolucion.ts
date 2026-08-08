/**
 * Tiempo de respuesta de los focos del checklist de vehículos.
 *
 * El reloj arranca cuando el chofer carga el checklist (`checklist_vehiculos.hora`)
 * y se detiene cuando mantenimiento cierra el plan de acción
 * (`checklist_planes_accion.resuelto_at`, sellado por trigger en la base).
 *
 * Todas las vistas que muestran el foco resuelto (checklist del chofer, detalle
 * del checklist, tablero de mantenimiento y el detalle diario de reuniones) usan
 * estos helpers para que el número sea siempre el mismo.
 */

export type PlanEstado = "pendiente" | "en_proceso" | "resuelto"

/** Lo mínimo que cada vista necesita saber del plan de acción de un ítem. */
export interface PlanResumen {
  estado: PlanEstado
  tipo: string
  descripcion: string
  /** Momento en que se cerró el plan; null = sigue abierto. */
  resueltoAt: string | null
  /** Horas entre la carga del checklist y el cierre del plan; null si sigue abierto. */
  horasResolucion: number | null
}

/** Horas transcurridas entre dos timestamps ISO. null si falta alguno o el orden es inválido. */
export function horasEntre(
  desde: string | null | undefined,
  hasta: string | null | undefined,
): number | null {
  if (!desde || !hasta) return null
  const t0 = new Date(desde).getTime()
  const t1 = new Date(hasta).getTime()
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null
  const horas = (t1 - t0) / 3_600_000
  // Un cierre anterior a la carga es dato sucio (backfill / carga retroactiva):
  // se muestra como "sin tiempo medible" en vez de un número negativo.
  return horas < 0 ? null : horas
}

/**
 * Duración legible para el chofer y para el tablero: "40 min", "5 h 20 min",
 * "2 d 4 h". Se redondea a la unidad de abajo — nadie necesita segundos acá.
 */
export function formatDuracion(horas: number | null): string {
  if (horas == null) return "—"
  if (horas < 1) {
    const min = Math.max(1, Math.round(horas * 60))
    return `${min} min`
  }
  if (horas < 24) {
    const h = Math.floor(horas)
    const min = Math.round((horas - h) * 60)
    return min > 0 ? `${h} h ${min} min` : `${h} h`
  }
  const d = Math.floor(horas / 24)
  const h = Math.round(horas - d * 24)
  return h > 0 ? `${d} d ${h} h` : `${d} d`
}

/** Semáforo del tiempo de respuesta: crítico ≤24 h, no crítico ≤72 h. */
export function colorTiempoRespuesta(
  horas: number | null,
  critico: boolean,
): "verde" | "ambar" | "rojo" | "neutro" {
  if (horas == null) return "neutro"
  const meta = critico ? 24 : 72
  if (horas <= meta) return "verde"
  if (horas <= meta * 2) return "ambar"
  return "rojo"
}

export const CLASE_TIEMPO: Record<
  "verde" | "ambar" | "rojo" | "neutro",
  string
> = {
  verde: "text-green-700",
  ambar: "text-amber-700",
  rojo: "text-red-700",
  neutro: "text-muted-foreground",
}

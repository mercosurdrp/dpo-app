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

/**
 * Tiempo de respuesta comprometido para un ítem observado en el checklist.
 *
 * **Crítico — 24 h.** Son los ítems marcados `critico` en `checklist_items`:
 * frenos, luces, pérdida de fluidos, matafuegos, cinturón, botiquín, EPP y
 * documentación. Si uno de esos está mal la unidad no debería salir, así que el
 * plazo es el día: o se repara, o la unidad queda fuera de servicio con su OT.
 *
 * **No crítico — 72 h (3 días hábiles).** Lonas, 5S, carrito, espejos, niveles:
 * no frenan el reparto, pero tres días es lo que tarda en conseguirse un
 * repuesto común sin que el defecto se vuelva costumbre.
 *
 * Medido en Pampeana sobre los 56 focos cerrados con tiempo verificable (abril a
 * septiembre de 2026), tomando como cierre el primer checklist en que el ítem
 * volvió a dar OK: mediana de 24 h en total —22,6 h los no críticos, 96 h los
 * críticos, inflados por la pérdida de fluidos del HELI1 que se arrastró tres
 * semanas—. O sea: la meta no es un deseo, es lo que la operación ya cumple
 * cuando el defecto se atiende de verdad.
 *
 * 🚨 El reloj NO mide "cuándo se cargó el plan en la app": mide contra la hora
 * del checklist. Cerrar un plan tarde no mejora el número, y cargarlo tarde
 * tampoco lo empeora si el defecto se resolvió en el día.
 */
export const META_RESPUESTA_HORAS = { critico: 24, noCritico: 72 } as const

/** Horas comprometidas según el ítem. */
export function metaRespuestaHoras(critico: boolean): number {
  return critico ? META_RESPUESTA_HORAS.critico : META_RESPUESTA_HORAS.noCritico
}

/** "meta 24 h" / "meta 72 h (3 días)", para ponerlo al lado del número. */
export function textoMetaRespuesta(critico: boolean): string {
  return critico ? "meta 24 h (crítico)" : "meta 72 h (3 días)"
}

/**
 * Semáforo del tiempo de respuesta.
 *
 * Verde = dentro de la meta. Ámbar = se pasó pero sigue en el orden del plazo
 * (48 h en críticos, 5 días en no críticos). Rojo = se fue de escala: ahí ya no
 * es un atraso, es un defecto que quedó conviviendo con la operación.
 */
export function colorTiempoRespuesta(
  horas: number | null,
  critico: boolean,
): "verde" | "ambar" | "rojo" | "neutro" {
  if (horas == null) return "neutro"
  const meta = metaRespuestaHoras(critico)
  if (horas <= meta) return "verde"
  if (horas <= (critico ? 48 : 120)) return "ambar"
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

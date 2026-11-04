// =============================================
// Observaciones por SECCIÓN de una reunión (Dimensionamiento, etc.)
//
// Igual que las de SLA, reutilizan la tabla reuniones_indicadores_observaciones
// del Tablero. La sección se identifica con la clave `seccion_<slug>`, donde el
// slug es el mismo de `reuniones_actividades.seccion` (ej. seccion_dimensionamiento).
// Un indicador del tablero nunca empieza con "seccion_" (es un uuid o una clave
// auto_*), y un SLA empieza con "sla_": el prefijo alcanza para distinguirlos.
// =============================================

export const SECCION_INDICADOR_PREFIJO = "seccion_"

/** Patrón LIKE para filtrar en PostgREST (el `_` se escapa). */
export const SECCION_INDICADOR_LIKE = "seccion\\_%"

export function seccionIndicadorId(seccion: string): string {
  return `${SECCION_INDICADOR_PREFIJO}${seccion}`
}

export function esIndicadorSeccion(indicadorId: string | null | undefined): boolean {
  return !!indicadorId && indicadorId.startsWith(SECCION_INDICADOR_PREFIJO)
}

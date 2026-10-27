import type { TipoReunion } from "@/types/database"

// =============================================
// Observaciones y acciones por SLA en las reuniones
//
// Las observaciones de la sección "Cumplimiento de SLA" reutilizan la tabla
// reuniones_indicadores_observaciones (la de la Etapa 3 del Tablero) y la
// columna indicador_id de reuniones_actividades. El SLA se identifica con la
// clave `sla_<codigo>` (ej. sla_plan_syop), así el historial de un SLA junta
// lo cargado en CUALQUIER reunión que lo revise: Logística, Ventas-Logística
// y Warehouse. Un indicador del tablero nunca empieza con "sla_" (es un uuid
// o una clave auto_*), por eso el prefijo alcanza para distinguirlos.
// =============================================

export const SLA_INDICADOR_PREFIJO = "sla_"

/** Patrón LIKE para filtrar en PostgREST (el `_` se escapa). */
export const SLA_INDICADOR_LIKE = "sla\_%"

export function slaIndicadorId(codigo: string): string {
  return `${SLA_INDICADOR_PREFIJO}${codigo}`
}

export function esIndicadorSla(indicadorId: string | null | undefined): boolean {
  return !!indicadorId && indicadorId.startsWith(SLA_INDICADOR_PREFIJO)
}

/** Código del SLA a partir del id de indicador, o null si no es un SLA. */
export function codigoSlaDe(indicadorId: string | null | undefined): string | null {
  return esIndicadorSla(indicadorId)
    ? indicadorId!.slice(SLA_INDICADOR_PREFIJO.length)
    : null
}

/**
 * Reuniones que tienen sección de Cumplimiento de SLA. Las observaciones y
 * acciones atadas a un SLA se comparten entre todas ellas.
 */
export const TIPOS_REUNION_CON_SLA: TipoReunion[] = [
  "logistica",
  "logistica-ventas",
  "warehouse",
]

export function reunionVeSla(tipo: TipoReunion | string): boolean {
  return (TIPOS_REUNION_CON_SLA as string[]).includes(tipo)
}

export const TIPO_REUNION_LABEL: Record<TipoReunion, string> = {
  logistica: "Logística",
  "logistica-ventas": "Ventas-Logística",
  "matinal-distribucion": "Matinal Distribución",
  warehouse: "Warehouse",
  presupuesto: "Presupuesto",
  mantenimiento: "Mantenimiento",
  "iniciativas-ahorro": "Iniciativas de Ahorro",
}

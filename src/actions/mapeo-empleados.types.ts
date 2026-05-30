// Sectores "core": tienen lógica de la app que depende del literal exacto
// (mis-capacitaciones, filtros de flota, etc.). No se pueden renombrar ni
// borrar desde la gestión de sectores. El resto vive en la tabla
// `sectores_empleado` y se administra desde /admin/mapeo-empleados.
export const SECTORES_CORE = [
  "Distribución",
  "Depósito",
  "Sin asignar",
] as const

// Fallback usado si la tabla de sectores aún no tiene filas.
export const SECTORES_EMPLEADO = SECTORES_CORE
// El sector ahora es texto libre (validado contra el catálogo de la DB).
export type SectorEmpleado = string

export interface SectorEmpleadoRow {
  id: string
  nombre: string
  es_core: boolean
  orden: number
}

export interface EmpleadoInput {
  legajo: number
  nombre: string
  numero_id: string
  sector: SectorEmpleado
  activo: boolean
}

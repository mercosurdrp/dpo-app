export const SECTORES_EMPLEADO = [
  "Distribución",
  "Depósito",
  "Sin asignar",
] as const
export type SectorEmpleado = (typeof SECTORES_EMPLEADO)[number]

export interface EmpleadoInput {
  legajo: number
  nombre: string
  numero_id: string
  sector: SectorEmpleado
  activo: boolean
}

// Tipos del módulo Orden de Salida Diario.
// Modelo conceptual: cada día se arman las "asignaciones por camión" (chofer + ayudante + zona)
// y aparte se carga el "personal que no sale" con su motivo.
// Personal y catálogos provienen de la hoja FORMACIÓN.

// ─── Padrón ────────────────────────────────────────────────────────────────
export type PuestoOperativo = "Chofer" | "Ayudante" | "Depósito"
export type Sucursal = "ELDORADO" | "IGUAZU"

export interface EmpleadoMock {
  id: string
  legajo: number | null
  numero: number | null
  nombre: string
  sucursal: Sucursal
  puesto: PuestoOperativo
  camion_fijo: string | null
  activo?: boolean
}

export interface CamionMock {
  id: string           // patente normalizada (clave estable)
  numero: number | null
  patente: string
  sucursal: Sucursal
  capacidad: number | null
}

// ─── Asignación diaria por camión ──────────────────────────────────────────
export type EstadoCamion =
  | "operativo"        // Sale, con o sin tripulación completa
  | "sin_asignar"      // No se le asignó tripulación todavía
  | "sin_carga"        // El camión queda sin reparto hoy (no hay carga para enviar)
  | "fuera_servicio"   // Roto / no usable hoy
  | "taller"           // En mantenimiento

export interface AsignacionCamionDiario {
  camion_id: string
  fecha: string                          // YYYY-MM-DD
  chofer_empleado_id: string | null
  ayudante_empleado_id: string | null
  zona: string
  estado: EstadoCamion
  observacion: string
  // Métricas de carga (se cargan manualmente al cierre del día)
  clientes: number | null
  sobrecarga_completa: number | null
  media_sobrecarga: number | null
  cuarto_sobrecarga: number | null
  bultos: number | null
}

// ─── Personal que no sale (queda abajo) ────────────────────────────────────
export type MotivoNoSale =
  | "deposito"
  | "vacaciones"
  | "licencia"
  | "ausente"
  | "suspendido"
  | "franco"
  | "otro"

export interface PersonalNoSaleDiario {
  empleado_id: string
  fecha: string
  motivo: MotivoNoSale
  detalle: string
}

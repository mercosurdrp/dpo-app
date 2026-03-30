// Enum types
export type UserRole = "admin" | "auditor" | "viewer"
export type EstadoAuditoria = "borrador" | "en_progreso" | "completada" | "archivada"
export type EstadoAccion = "pendiente" | "en_progreso" | "completado"

// Table interfaces
export interface Profile {
  id: string
  email: string
  nombre: string
  role: UserRole
  active: boolean
  created_at: string
  updated_at: string
}

export interface Pilar {
  id: string
  nombre: string
  orden: number
  color: string
  icono: string
  meta: number
}

export interface Bloque {
  id: string
  pilar_id: string
  nombre: string
  orden: number
  categoria: CategoriaBloque | null
}

export interface Pregunta {
  id: string
  bloque_id: string
  key: string
  numero: string
  texto: string
  mandatorio: boolean
  peso: number
  guia: string | null
  requerimiento: string | null
  puntaje_criterio: Record<string, string>
  como_verificar: string | null
}

export interface Auditoria {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string | null
  estado: EstadoAuditoria
  created_by: string
  created_at: string
  updated_at: string
}

export interface Respuesta {
  id: string
  auditoria_id: string
  pregunta_id: string
  puntaje: 0 | 1 | 3 | 5 | null
  comentario: string | null
  evidencia_urls: string[]
  auditor_id: string
  updated_at: string
}

export interface Accion {
  id: string
  respuesta_id: string
  descripcion: string
  responsable: string
  fecha_limite: string
  estado: EstadoAccion
  evidencia_urls: string[]
  created_at: string
  updated_at: string
}

// Indicador (KPI per question)
export type Tendencia = "mejora" | "estable" | "deterioro" | "neutral"

export interface Indicador {
  id: string
  pregunta_id: string
  nombre: string
  meta: number
  actual: number
  unidad: string
  tendencia: Tendencia
  notas: string | null
  created_at: string
  updated_at: string
}

// Evidencia (evidence per question)
export type TipoEvidencia = "documento" | "foto" | "link" | "nota"

export interface Evidencia {
  id: string
  pregunta_id: string
  titulo: string
  descripcion: string | null
  url: string | null
  file_path: string | null
  tipo: TipoEvidencia
  created_by: string | null
  created_at: string
}

// Plan de Accion (action plan per question)
export type EstadoPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadPlan = "alta" | "media" | "baja"

export interface PlanAccion {
  id: string
  pregunta_id: string
  descripcion: string
  responsable: string
  fecha_inicio: string | null
  fecha_limite: string | null
  estado: EstadoPlan
  prioridad: PrioridadPlan
  progreso: number
  notas: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Evidencia-Plan junction
export interface EvidenciaPlan {
  id: string
  evidencia_id: string
  plan_id: string
  created_at: string
}

// Plan comments (timeline)
export interface PlanComentario {
  id: string
  plan_id: string
  texto: string
  foto_url: string | null
  created_by: string
  created_at: string
}

// Plan state change history
export interface PlanHistorial {
  id: string
  plan_id: string
  estado_anterior: EstadoPlan
  estado_nuevo: EstadoPlan
  changed_by: string
  changed_at: string
}

// Bloque categoria
export type CategoriaBloque = "fundamentales" | "mantener" | "mejorar"

// Joined/extended types
export interface BloqueConPreguntas extends Bloque {
  preguntas: Pregunta[]
}

export interface PilarConBloques extends Pilar {
  bloques: BloqueConPreguntas[]
}

export interface RespuestaConPregunta extends Respuesta {
  pregunta: Pregunta
}

export interface AccionConRespuesta extends Accion {
  respuesta: RespuestaConPregunta
}

// Plan detail (full page)
export interface PlanComentarioConAutor extends PlanComentario {
  autor_nombre: string
}

export interface PlanHistorialConAutor extends PlanHistorial {
  autor_nombre: string
}

export interface EvidenciaConPlanes extends Evidencia {
  plan_ids: string[]
}

export interface PlanAccionFull extends PlanAccion {
  pregunta_numero: string
  pregunta_texto: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
  comentarios: PlanComentarioConAutor[]
  historial: PlanHistorialConAutor[]
  evidencias: Evidencia[]
}

// SOP (Standard Operating Procedure)
export interface Sop {
  id: string
  pilar_id: string
  nombre: string
  descripcion: string | null
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  version: number
  uploaded_by: string
  created_at: string
  updated_at: string
}

export interface SopVersion {
  id: string
  sop_id: string
  version: number
  file_path: string
  file_name: string
  file_size: number
  notas: string | null
  uploaded_by: string
  created_at: string
}

export interface SopConVersiones extends Sop {
  versiones: SopVersion[]
  uploaded_by_nombre: string
}

// Registros de Vehículos (TML)
export type TipoRegistroVehiculo = "ingreso" | "egreso"

export interface RegistroVehiculo {
  id: string
  tipo: TipoRegistroVehiculo
  fecha: string
  dominio: string
  chofer: string
  ayudante1: string | null
  ayudante2: string | null
  odometro: number | null
  hora: string // TIME as "HH:MM:SS"
  semana: number
  hora_entrada: number // 6 o 7
  tml_minutos: number | null
  observaciones: string | null
  created_by: string | null
  created_at: string
}

export interface CatalogoChofer {
  id: string
  nombre: string
  active: boolean
  created_at: string
}

export interface CatalogoVehiculo {
  id: string
  dominio: string
  descripcion: string | null
  active: boolean
  created_at: string
}

// KPI aggregated types
export interface TmlDiario {
  fecha: string
  promedio_tml: number
  total_egresos: number
  dentro_meta: number
  pct_dentro_meta: number
}

export interface TmlSemanal {
  semana: number
  year: number
  promedio_tml: number
  total_egresos: number
  dentro_meta: number
  pct_dentro_meta: number
}

export interface TmlMensual {
  mes: number
  year: number
  promedio_tml: number
  total_egresos: number
  dentro_meta: number
  pct_dentro_meta: number
}

// Plan list item (for /planes page)
export interface PlanAccionListItem extends PlanAccion {
  pregunta_numero: string
  pregunta_texto: string
  pilar_nombre: string
  pilar_color: string
  comentarios_count: number
  evidencias_count: number
}

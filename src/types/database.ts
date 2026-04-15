// Enum types
export type UserRole = "admin" | "auditor" | "viewer" | "empleado"
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

// Capacitaciones
export type EstadoCapacitacion = "programada" | "en_curso" | "completada" | "cancelada"
export type ResultadoCapacitacion = "aprobado" | "desaprobado" | "pendiente"

export interface Empleado {
  id: string
  profile_id: string | null
  legajo: number
  nombre: string
  numero_id: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Capacitacion {
  id: string
  titulo: string
  descripcion: string | null
  instructor: string
  fecha: string
  duracion_horas: number
  lugar: string | null
  material_url: string | null
  pilar: string | null
  estado: EstadoCapacitacion
  visible: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Asistencia {
  id: string
  capacitacion_id: string
  empleado_id: string
  presente: boolean
  nota: number | null
  resultado: ResultadoCapacitacion
  observaciones: string | null
  created_at: string
  updated_at: string
}

export interface AsistenciaConEmpleado extends Asistencia {
  empleado: Empleado
}

export interface CapacitacionFull extends Capacitacion {
  asistencias: AsistenciaConEmpleado[]
}

export interface CapacitacionPregunta {
  id: string
  capacitacion_id: string
  texto: string
  opciones: string[]
  respuesta_correcta: number
  orden: number
  created_at: string
}

export interface CapacitacionRespuesta {
  id: string
  capacitacion_id: string
  empleado_id: string
  pregunta_id: string
  respuesta_elegida: number
  es_correcta: boolean
  created_at: string
}

// Mapeo empleado → identidades externas
export interface MapeoEmpleadoFletero {
  id: string
  empleado_id: string
  id_fletero_carga: number | null
  ds_fletero_carga: string
  notas: string | null
  created_at: string
  updated_at: string
}

export interface MapeoEmpleadoChofer {
  id: string
  empleado_id: string
  nombre_chofer: string
  notas: string | null
  created_at: string
  updated_at: string
}

export interface EmpleadoCompleto {
  empleado_id: string
  legajo: number
  nombre: string
  sector: string
  activo: boolean
  id_fletero_carga: number | null
  ds_fletero_carga: string | null
  nombre_chofer: string | null
}

// Checklist Vehículos
export type TipoChecklist = "liberacion" | "retorno"
export type ResultadoChecklist = "aprobado" | "rechazado"
export type TipoRespuestaChecklist = "ok_nook" | "bueno_regular_malo" | "ok_regular_nook"

export interface ChecklistItem {
  id: string
  categoria: string
  nombre: string
  descripcion: string | null
  critico: boolean
  tipo_respuesta: TipoRespuestaChecklist
  orden: number
  active: boolean
  created_at: string
}

export interface ChecklistVehiculo {
  id: string
  tipo: TipoChecklist
  fecha: string
  dominio: string
  chofer: string
  hora: string // TIMESTAMPTZ
  resultado: ResultadoChecklist
  observaciones: string | null
  tiempo_ruta_minutos: number | null
  odometro: number | null
  created_by: string | null
  created_at: string
}

export interface ChecklistRespuesta {
  id: string
  checklist_id: string
  item_id: string
  valor: string // 'ok', 'nook', 'bueno', 'regular', 'malo'
  comentario: string | null
  created_at: string
}

export interface ChecklistVehiculoConRespuestas extends ChecklistVehiculo {
  respuestas: (ChecklistRespuesta & { item: ChecklistItem })[]
}

// KPI Tiempo en Ruta
export interface TiempoRutaSemanal {
  semana: number
  year: number
  promedio_minutos: number
  total_retornos: number
  dentro_meta: number
  pct_dentro_meta: number
}

export interface TiempoRutaMensual {
  mes: number
  year: number
  promedio_minutos: number
  total_retornos: number
  dentro_meta: number
  pct_dentro_meta: number
}

// Registro Combustible
export interface RegistroCombustible {
  id: string
  fecha: string
  dominio: string
  chofer: string
  odometro: number
  litros: number
  km_recorridos: number | null
  rendimiento: number | null
  tipo_combustible: string
  proveedor: string | null
  numero_remito: string | null
  costo_total: number | null
  observaciones: string | null
  created_by: string | null
  created_at: string
}

export interface RendimientoSemanal {
  semana: number
  year: number
  promedio_rendimiento: number
  total_litros: number
  total_km: number
  total_cargas: number
}

export interface RendimientoMensual {
  mes: number
  year: number
  promedio_rendimiento: number
  total_litros: number
  total_km: number
  total_cargas: number
}

// OWD Pre-Ruta
export type OwdResultado = "ok" | "nook" | "na"

export interface OwdItem {
  id: string
  version: number
  etapa: string
  orden: number
  texto: string
  descripcion: string | null
  critico: boolean
  active: boolean
  created_at: string
}

export interface OwdObservacion {
  id: string
  fecha: string
  hora: string
  supervisor: string
  empleado_observado: string
  rol_empleado: string | null
  dominio: string | null
  template_version: number
  total_items: number
  total_ok: number
  total_nook: number
  total_na: number
  pct_cumplimiento: number
  accion_correctiva: string | null
  observaciones: string | null
  created_by: string | null
  created_at: string
}

export interface OwdRespuesta {
  id: string
  observacion_id: string
  item_id: string
  resultado: OwdResultado
  comentario: string | null
  created_at: string
}

export interface OwdMensual {
  mes: number
  year: number
  total_observaciones: number
  promedio_cumplimiento: number
}

export interface OwdItemStats {
  item_id: string
  etapa: string
  texto: string
  total_ok: number
  total_nook: number
  total_na: number
  pct_cumplimiento: number
}

// Plan de Acción TML (R1.1.4)
export type PlanTmlEstado = "abierto" | "en_progreso" | "cerrado"
export type PlanTmlItemEstado = "pendiente" | "en_progreso" | "completado"

export interface TmlPlanAccion {
  id: string
  mes: number
  year: number
  promedio_tml_mes: number
  pct_dentro_meta_mes: number
  causa_raiz: string
  estado: PlanTmlEstado
  fecha_cierre: string | null
  resultado_cierre: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TmlPlanAccionItem {
  id: string
  plan_id: string
  accion: string
  responsable: string
  fecha_compromiso: string
  estado: PlanTmlItemEstado
  fecha_completado: string | null
  observaciones: string | null
  orden: number
  created_at: string
}

export interface TmlPlanResumen {
  year: number
  mes: number
  promedio_tml: number
  pct_dentro_meta: number
  fuera_meta: boolean
  plan: TmlPlanAccion | null
  items_total: number
  items_completados: number
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

// Vehículos analytics
export interface VehiculoKmDia {
  dominio: string
  fecha: string
  km: number
  lecturas: number
  odometro_min: number
  odometro_max: number
}

export interface KmFlotaResumen {
  kmHoy: number
  kmAyer: number
  kmMesActual: number
  promedioDiarioMes: number
  topVehiculosMes: { dominio: string; km: number }[]
  bottomVehiculosMes: { dominio: string; km: number }[]
  serieDiariaMes: { fecha: string; km: number }[]
}

export interface VehiculoTimelineEvento {
  tipo: "egreso" | "retorno" | "liberacion" | "retorno_chk" | "combustible" | "checklist_nook"
  fecha: string
  hora: string
  descripcion: string
  chofer: string | null
  odometro: number | null
  link: string | null
}

export interface VehiculoDetalle {
  vehiculo: CatalogoVehiculo
  kpis: {
    kmMes: number
    kmYTD: number
    kmHistorico: number
    rendimientoPromedio: number
    costoMes: number
    costoTotalHistorico: number
    tmlPromedio: number
    totalEgresosMes: number
    ultimoOdometro: number | null
    ultimaActividad: string | null
  }
  kmUltimos30Dias: { fecha: string; km: number }[]
  rendimientoUltimas10Cargas: { fecha: string; rendimiento: number; km: number; litros: number }[]
  timeline: VehiculoTimelineEvento[]
  proximaAlerta: AlertaVehiculo | null
}

export type AlertaSeveridad = "info" | "warning" | "danger"
export type AlertaTipo = "sin_movimiento" | "retroceso_odometro" | "rendimiento_bajo" | "sin_liberacion"

export interface AlertaVehiculo {
  id: string
  tipo: AlertaTipo
  severidad: AlertaSeveridad
  dominio: string
  titulo: string
  descripcion: string
  valor?: string | number
  fecha?: string
}

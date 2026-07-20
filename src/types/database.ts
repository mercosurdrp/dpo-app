import type { ArchivoAvance } from "@/lib/adjuntos-avance"

// Enum types
export type UserRole =
  | "admin"
  | "auditor"
  | "viewer"
  | "empleado"
  | "supervisor"
  | "admin_rrhh"
export type EstadoAuditoria = "borrador" | "en_progreso" | "completada" | "archivada"
export type EstadoAccion = "pendiente" | "en_progreso" | "completado"

// Table interfaces
export interface Profile {
  id: string
  email: string
  nombre: string
  role: UserRole
  active: boolean
  puede_asignar_tareas: boolean
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
  pregunta_id: string | null
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

export type PlanTipo = "auditoria" | "directa"

export interface PlanAccion {
  id: string
  pregunta_id: string | null
  tipo: PlanTipo
  titulo: string | null
  descripcion: string
  responsable: string
  fecha_inicio: string | null
  fecha_limite: string | null
  estado: EstadoPlan
  prioridad: PrioridadPlan
  progreso: number
  notas: string | null
  evidencia_obligatoria: boolean
  cerrado_sin_evidencia_motivo: string | null
  // Si esta tarea es un seguimiento, apunta a la tarea original que la generó.
  origen_plan_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Multi-responsables (M2M plan ↔ profile con rol)
export type PlanResponsableRol = "responsable_principal" | "coresponsable"

export interface PlanResponsable {
  id: string
  plan_id: string
  profile_id: string
  rol: PlanResponsableRol
  asignado_por: string | null
  asignado_at: string
}

export interface PlanResponsableConProfile extends PlanResponsable {
  profile_nombre: string
  profile_email: string | null
  profile_role: UserRole
}

// Reprogramaciones del plan
export interface PlanReprogramacion {
  id: string
  plan_id: string
  fecha_anterior: string | null
  fecha_nueva: string
  motivo: string | null
  reprogramado_por: string
  reprogramado_at: string
}

export interface PlanReprogramacionConAutor extends PlanReprogramacion {
  autor_nombre: string
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

export interface PlanSeguimientoRef {
  id: string
  titulo: string
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
  archivos_dpo: DpoArchivo[]
  responsables: PlanResponsableConProfile[]
  reprogramaciones: PlanReprogramacionConAutor[]
  // Tarea original de la que ésta es seguimiento (si aplica).
  origen: PlanSeguimientoRef | null
  // Tareas de seguimiento que esta tarea generó al cerrarse.
  seguimientos: PlanSeguimientoRef[]
}

// Estado unificado para Mis Tareas (todos los orígenes mapean a estos 3 valores)
export type EstadoTareaUnificado = "no_comenzada" | "en_curso" | "cerrada"

// Plan de acción (origen "plan_accion")
export interface MisTareasItemPlan extends PlanAccion {
  origen: "plan_accion"
  pregunta_numero: string
  pregunta_texto: string
  pilar_nombre: string
  pilar_color: string
  rol_usuario: PlanResponsableRol
  is_overdue: boolean
  dias_para_vencer: number | null
  evidencias_count: number
  estado_unificado: EstadoTareaUnificado
}

// Acción 5S (origen "s5_accion")
export interface MisTareasItemS5 {
  origen: "s5_accion"
  id: string
  descripcion: string
  fecha_limite: string | null
  is_overdue: boolean
  dias_para_vencer: number | null
  evidencias_count: number
  estado_unificado: EstadoTareaUnificado
  s5_tipo: "flota" | "almacen"
  s5_sector_numero: number | null
  s5_sector_nombre: string | null
  s5_vehiculo_dominio: string | null
}

// Discriminated union para la lista consolidada
export type MisTareasItem = MisTareasItemPlan | MisTareasItemS5

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

export type VehiculoSector = "distribucion" | "deposito"
export type VehiculoTipo = "camion" | "camioneta" | "autoelevador" | "utilitario" | "acoplado"

export interface CatalogoVehiculo {
  id: string
  dominio: string
  descripcion: string | null
  modelo: string | null
  anio: number | null
  sector: VehiculoSector
  tipo: VehiculoTipo | null
  active: boolean
  created_at: string
}

export const VEHICULO_SECTOR_LABELS: Record<VehiculoSector, string> = {
  distribucion: "Distribución",
  deposito: "Depósito",
}

export const VEHICULO_TIPO_LABELS: Record<VehiculoTipo, string> = {
  camion: "Camión",
  camioneta: "Camioneta",
  autoelevador: "Autoelevador",
  utilitario: "Utilitario",
  acoplado: "Acoplado",
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
  sector: string
  activo: boolean
  created_at: string
  updated_at: string
  // RRHH (migración 037)
  supervisor_id: string | null
  area: string | null
  departamento: string | null
  puesto: string | null
  fecha_ingreso: string | null
  tipo_contrato: TipoContrato | null
  cuil: string | null
  telefono: string | null
  email_personal: string | null
}

export type TipoContrato = "planta_permanente" | "plazo_fijo" | "eventual"

export const TIPO_CONTRATO_LABELS: Record<TipoContrato, string> = {
  planta_permanente: "Planta permanente",
  plazo_fijo: "Plazo fijo",
  eventual: "Eventual",
}

// ===== RRHH: Licencias =====
export interface RrhhTipoLicencia {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  computa_dias_anuales: boolean
  requiere_certificado: boolean
  novedad_asistencia_tipo: string
  activo: boolean
  created_at: string
}

export interface RrhhSaldoVacaciones {
  id: string
  empleado_id: string
  anio: number
  dias_otorgados: number
  dias_usados: number
  observaciones: string | null
  created_at: string
  updated_at: string
}

export type RrhhSolicitudEstado =
  | "pendiente_supervisor"
  | "pendiente_rrhh"
  | "aprobada"
  | "rechazada"
  | "cancelada"

export const RRHH_SOLICITUD_ESTADO_LABELS: Record<RrhhSolicitudEstado, string> = {
  pendiente_supervisor: "Pendiente supervisor",
  pendiente_rrhh: "Pendiente RRHH",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
}

export const RRHH_SOLICITUD_ESTADO_COLORS: Record<RrhhSolicitudEstado, string> = {
  pendiente_supervisor: "#F59E0B",
  pendiente_rrhh: "#3B82F6",
  aprobada: "#10B981",
  rechazada: "#EF4444",
  cancelada: "#64748B",
}

export interface RrhhSolicitudLicencia {
  id: string
  empleado_id: string
  tipo_licencia_id: string
  fecha_desde: string
  fecha_hasta: string
  dias_solicitados: number
  motivo: string | null
  certificado_path: string | null
  estado: RrhhSolicitudEstado
  supervisor_id: string | null
  supervisor_decision_at: string | null
  supervisor_observacion: string | null
  rrhh_user_id: string | null
  rrhh_decision_at: string | null
  rrhh_observacion: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface RrhhSolicitudConDetalle extends RrhhSolicitudLicencia {
  empleado_nombre: string
  empleado_legajo: number
  tipo_licencia_codigo: string
  tipo_licencia_nombre: string
  certificado_url: string | null
}

// ===== RRHH: Jornadas =====
export interface RrhhJornadaPlantilla {
  id: string
  nombre: string
  hora_entrada: string // HH:MM:SS
  hora_salida: string
  tolerancia_minutos: number
  horas_esperadas: number
  activo: boolean
  created_at: string
}

export interface RrhhJornadaAsignacion {
  id: string
  empleado_id: string
  jornada_id: string
  vigente_desde: string
  vigente_hasta: string | null
  dias_semana: number[]
  created_at: string
}

export interface RrhhJornadaAsignacionConPlantilla extends RrhhJornadaAsignacion {
  plantilla: RrhhJornadaPlantilla
  empleado_nombre: string
  empleado_legajo: number
}

export interface RrhhJornadaExcepcion {
  id: string
  empleado_id: string
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  motivo: string | null
  no_laborable: boolean
  created_by: string | null
  created_at: string
}

// ===== RRHH: Reportes derivados =====
export interface RrhhInasistenciaRow {
  legajo: number
  nombre: string
  fecha: string
  motivo: "sin_marca" | "novedad" | "no_laborable"
  novedad_tipo: string | null
}

export interface RrhhTotalHorasRow {
  legajo: number
  nombre: string
  dias_trabajados: number
  horas_trabajadas: number
  horas_esperadas: number
  diferencia_horas: number
}

export interface RrhhPausaRow {
  legajo: number
  fecha: string
  pausa_inicio: string
  pausa_fin: string
  duracion_minutos: number
}

// ===== RRHH: Empleado con jerarquía / contexto =====
export interface EmpleadoConSupervisor extends Empleado {
  supervisor_nombre: string | null
  supervisor_legajo: number | null
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

export interface CapacitacionConResumen extends Capacitacion {
  total_asistentes: number
  presentes: number
  rendidos: number
  pendientes: number
  aprobados: number
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

// Capacitacion ↔ DPO Puntos (junction)
export interface CapacitacionDpoPunto {
  id: string
  capacitacion_id: string
  pregunta_id: string
  created_at: string
}

export interface CapacitacionDpoPuntoFull extends CapacitacionDpoPunto {
  pregunta_numero: string
  pregunta_texto: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
}

export interface CapacitacionParaPregunta {
  id: string
  titulo: string
  instructor: string
  fecha: string
  estado: EstadoCapacitacion
  duracion_horas: number
  total_asistentes: number
  presentes: number
  aprobados: number
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
  // NULL = checklist general (camiones); "autoelevador" = checklist propio de autoelevadores
  tipo_vehiculo: VehiculoTipo | null
}

// Ficha técnica de la unidad (datos maestros, sync Cloudfleet + edición manual)
export interface VehiculoFicha {
  dominio: string
  cloudfleet_id: number | null
  marca: string | null
  modelo: string | null
  anio: string | null
  color: string | null
  tipo_unidad: string | null
  combustible: string | null
  combustible_aux: string | null
  chasis: string | null
  vin: string | null
  motor: string | null
  capacidad_carga: string | null
  carroceria: string | null
  ciudad: string | null
  centro_costo: string | null
  chofer_asignado: string | null
  notas: string | null
  foto_path: string | null
  foto_url?: string | null // derivada (getPublicUrl), no es columna
  cf_odometro: number | null
  cf_odometro_fecha: string | null
  cf_synced_at: string | null
  updated_by: string | null
  updated_at: string
}

// Campos de la ficha editables a mano / completables desde Cloudfleet
export type CampoFicha =
  | "marca"
  | "modelo"
  | "anio"
  | "color"
  | "tipo_unidad"
  | "combustible"
  | "combustible_aux"
  | "chasis"
  | "vin"
  | "motor"
  | "capacidad_carga"
  | "carroceria"
  | "ciudad"
  | "centro_costo"
  | "chofer_asignado"
  | "notas"

export type VehiculoDocumentoTipo = "cedula" | "titulo" | "seguro" | "vtv" | "otro"

export interface VehiculoDocumento {
  id: string
  dominio: string
  nombre: string
  tipo: VehiculoDocumentoTipo
  storage_path: string
  mime_type: string | null
  vencimiento: string | null
  created_by: string | null
  created_at: string
  url?: string // derivada (getPublicUrl)
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
  iniciado_en: string | null // TIMESTAMPTZ — inicio de llenado del form
  duracion_segundos: number | null // segundos que tardó en completarse
  foto_path?: string | null // foto adjunta (solo Pampeana; camionetas)
  foto_url?: string | null // URL pública derivada de foto_path (solo en detalle)
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

// A quién se atribuye un ítem del checklist: condiciona la tendencia por operario
export type OwdResponsable = "operario" | "sdr" | "proceso"

// Rol del observado al que aplica el ítem: filtra las preguntas al cargar la OWD
export type OwdItemRol = "chofer" | "ayudante" | "ambos"

export interface OwdItem {
  id: string
  template_id: string | null
  version: number
  etapa: string
  orden: number
  texto: string
  descripcion: string | null
  critico: boolean
  responsable: OwdResponsable
  rol: OwdItemRol
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
  template_id: string | null
  template_version: number
  total_items: number
  total_ok: number
  total_nook: number
  total_na: number
  pct_cumplimiento: number
  duracion_minutos: number | null
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

// Fotos de evidencia adjuntas a una respuesta de OWD (galería, 1 fila por foto)
export interface OwdRespuestaFoto {
  id: string
  respuesta_id: string
  path: string
  nombre: string | null
  mime: string | null
  bytes: number | null
  orden: number
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

// Plantilla OWD: una por punto del manual DPO (vinculada a preguntas.id)
export interface OwdTemplate {
  id: string
  pregunta_id: string
  nombre: string
  descripcion: string | null
  meta_mensual: number
  meta_cumplimiento_pct: number
  activo: boolean
  empleados_permitidos: string[] | null
  supervisor_default: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Plantilla + contexto del punto + KPIs del mes, para la landing /owd
export interface OwdTemplateResumen {
  template: OwdTemplate
  pregunta_numero: string
  pregunta_texto: string
  bloque_nombre: string
  pilar_id: string
  pilar_nombre: string
  pilar_color: string
  total_items: number
  obs_mes: number
  pct_cumplimiento_mes: number
  pct_cumplimiento_global: number
}

// ---------- OWD · Tendencia por operario ----------
export type OwdEstadoOperario = "rojo" | "amarillo" | "verde"

// Métricas de un operario calculadas SOLO sobre ítems atribuibles a él
export interface OwdTendenciaOperario {
  operario: string
  rol: string | null
  auditorias: number
  promPropio: number // % promedio sobre ítems del operario
  promGlobal: number // % promedio sobre todos los ítems (para comparar)
  primera: number
  ultima: number
  tendencia: "sube" | "baja" | "estable"
  estado: OwdEstadoOperario
  motivos: string[] // por qué quedó en este estado
  itemsRecurrentes: Array<{ texto: string; critico: boolean; veces: number }>
  planesAbiertos: number
}

// ---------- OWD · Planes de acción ----------
export type OwdPlanOrigen = "observacion" | "operario"
export type OwdPlanEstado = "pendiente" | "en_progreso" | "completado"
export type OwdPlanPrioridad = "alta" | "media" | "baja"

export interface OwdPlan {
  id: string
  template_id: string | null
  origen: OwdPlanOrigen
  observacion_id: string | null
  operario: string | null
  titulo: string
  descripcion: string | null
  causa_raiz: string | null
  prioridad: OwdPlanPrioridad
  estado: OwdPlanEstado
  responsable_id: string | null
  fecha_objetivo: string | null
  baseline_pct: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface OwdPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: OwdPlanEstado | null
  autor_id: string | null
  created_at: string
}

// Plan + datos derivados para la UI
export interface OwdPlanConDetalle extends OwdPlan {
  responsable_nombre: string | null
  avances: OwdPlanAvance[]
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
  evidencia_cierre_url: string | null
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

// ===== TI — Tiempo Interno (R1.3.x) =====
// TI = (fichaje biométrico de salida) − (hora del checklist de retorno),
// por chofer/día. Meta: ≤30 min y ≥65% en meta.
export interface TiSemanal {
  semana: number
  year: number
  promedio_minutos: number
  total: number
  dentro_meta: number
  pct_dentro_meta: number
}

export interface TiMensual {
  mes: number
  year: number
  promedio_minutos: number
  total: number
  dentro_meta: number
  pct_dentro_meta: number
}

// Un registro individual de TI (un retorno con su salida cruzada).
export interface TiRegistro {
  fecha: string
  chofer: string
  legajo: number | null
  dominio: string
  hora_retorno: string // ISO UTC del checklist de retorno
  hora_salida: string | null // ISO UTC normalizado del biométrico
  ti_minutos: number | null
  motivo_sin_dato: "sin_match" | "sin_biometrico" | "negativo" | "outlier" | null
}

export interface TiKpis {
  totalRetornos: number
  conTi: number // retornos con TI calculable
  sinBiometrico: number
  excluidos: number // negativos + outliers
  promedioMinutos: number
  mediana: number
  dentroMeta: number
  pctDentroMeta: number
  metaMinutos: number
  pctMetaMinimo: number
  semanal: TiSemanal[]
  mensual: TiMensual[]
  registros: TiRegistro[]
}

export type PlanTiEstado = "abierto" | "en_progreso" | "cerrado"
export type PlanTiItemEstado = "pendiente" | "en_progreso" | "completado"

export interface TiPlanAccion {
  id: string
  mes: number
  year: number
  promedio_ti_mes: number
  pct_dentro_meta_mes: number
  causa_raiz: string
  estado: PlanTiEstado
  fecha_cierre: string | null
  resultado_cierre: string | null
  evidencia_cierre_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TiPlanAccionItem {
  id: string
  plan_id: string
  accion: string
  responsable: string
  fecha_compromiso: string
  estado: PlanTiItemEstado
  fecha_completado: string | null
  observaciones: string | null
  orden: number
  created_at: string
}

export interface TiPlanResumen {
  year: number
  mes: number
  promedio_ti: number
  pct_dentro_meta: number
  fuera_meta: boolean
  plan: TiPlanAccion | null
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
  // Responsable principal resuelto desde plan_responsables (nombre real).
  // Si está vacío, usar plan.responsable (campo text legacy).
  responsable_principal_nombre: string | null
  coresponsables_count: number
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
  // Solo autoelevadores: horas por día de TODA la historia (una fila por día con
  // lectura), para que el detalle pueda ofrecer un selector de mes sin volver al
  // servidor. En camiones va vacío.
  horasPorDia: { fecha: string; km: number }[]
  rendimientoUltimas10Cargas: { fecha: string; rendimiento: number; km: number; litros: number }[]
  timeline: VehiculoTimelineEvento[]
  proximaAlerta: AlertaVehiculo | null
}

export type AlertaSeveridad = "info" | "warning" | "danger"
export type AlertaTipo =
  | "sin_movimiento"
  | "retroceso_odometro"
  | "rendimiento_bajo"
  | "sin_liberacion"
  | "mantenimiento_vencido"
  | "mantenimiento_proximo"

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

// ===== Plan de mantenimiento de flota =====

export type MantenimientoCategoria =
  | "motor"
  | "frenos"
  | "neumaticos"
  | "electrico"
  | "hidraulico"
  | "general"
  | "documentacion"

export const MANTENIMIENTO_CATEGORIA_LABELS: Record<MantenimientoCategoria, string> = {
  motor: "Motor",
  frenos: "Frenos",
  neumaticos: "Neumáticos",
  electrico: "Eléctrico",
  hidraulico: "Hidráulico",
  general: "General",
  documentacion: "Documentación",
}

export interface MantenimientoPlanTarea {
  id: string
  codigo: string
  nombre: string
  categoria: MantenimientoCategoria
  tipo_vehiculo: VehiculoTipo
  frecuencia_km: number | null
  frecuencia_meses: number | null
  frecuencia_horas: number | null
  activo: boolean
  orden: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MantenimientoPlanOverride {
  id: string
  dominio: string
  tarea_id: string
  frecuencia_km: number | null
  frecuencia_meses: number | null
  frecuencia_horas: number | null
  activo: boolean
  created_by: string | null
  created_at: string
}

export type MantenimientoTipo = "preventivo" | "correctivo" | "proactivo"
export type MantenimientoEstado = "programado" | "en_taller" | "completado" | "cancelado"

export const MANTENIMIENTO_ESTADO_LABELS: Record<MantenimientoEstado, string> = {
  programado: "Programado",
  en_taller: "En taller",
  completado: "Completado",
  cancelado: "Cancelado",
}

export interface MantenimientoRealizadoTarea {
  id: string
  mantenimiento_id: string
  tarea_id: string | null
  descripcion: string | null
  costo: number | null
  created_at: string
}

export interface MantenimientoRealizadoRepuesto {
  id: string
  mantenimiento_id: string
  descripcion: string
  cantidad: number
  costo_unitario: number | null
  created_at: string
}

export interface MantenimientoRealizado {
  id: string
  dominio: string
  fecha: string
  odometro: number | null
  horometro: number | null
  tipo: MantenimientoTipo
  estado: MantenimientoEstado
  taller: string | null
  costo: number | null
  numero_factura: string | null
  /** Nº de orden de trabajo propio (ej. "1471"), distinto de la factura. */
  numero_ot: string | null
  /** Horas de mano de obra de la OT. */
  horas_mano_obra: number | null
  /** Costo de la mano de obra de la OT. */
  costo_mano_obra: number | null
  observaciones: string | null
  evidencia_urls: string[] | null
  /** Período fuera de servicio (para disponibilidad de flota). NULL = no sacó la unidad de ruta. */
  fuera_servicio_desde: string | null
  fuera_servicio_hasta: string | null
  /** Entrada/salida del taller con fecha+hora (ISO). De acá se deriva el período fuera de servicio. */
  entrada_taller: string | null
  salida_taller: string | null
  /** true = service general/rodado: ancla el contador del próximo service. */
  es_service_general: boolean
  /** Origen del registro: cargado a mano o traído del sync de Cloudfleet. */
  origen: "manual" | "cloudfleet"
  /** Nº de OT en Cloudfleet (clave del upsert del sync). NULL en las manuales. */
  cloudfleet_number: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  tareas?: MantenimientoRealizadoTarea[]
  repuestos?: MantenimientoRealizadoRepuesto[]
}

export type EstadoTareaMantenimiento = "ok" | "proximo" | "vencido" | "sin_datos"

export interface EstadoPlanCelda {
  tareaId: string
  estado: EstadoTareaMantenimiento
  /** Último mantenimiento completado que incluyó la tarea. */
  ultimaFecha: string | null
  ultimoOdometro: number | null
  ultimoHorometro: number | null
  /** Próximos vencimientos según frecuencia efectiva (override ?? plantilla). */
  proximoKm: number | null
  proximaFecha: string | null
  proximasHoras: number | null
  /** % de la frecuencia ya consumido (0-100+, el peor de los ejes con datos). */
  pctConsumido: number | null
  /** true cuando el estado se calculó solo por tiempo (sin lecturas km/horas). */
  soloPorTiempo: boolean
}

export interface EstadoPlanVehiculo {
  vehiculo: CatalogoVehiculo
  /** Km actual reconstruido de las 3 fuentes de odómetro (null si no hay lecturas). */
  kmActual: number | null
  /** Último horómetro registrado en mantenimientos (autoelevadores). */
  horasActuales: number | null
  celdas: EstadoPlanCelda[]
}

export interface CostosMantenimiento {
  costoMes: number
  costoYTD: number
  porMes: { mes: string; preventivo: number; correctivo: number; proactivo: number }[]
}

// ===== Libro de gastos de flota / mantenimiento (facturas, boletas, caja chica) =====
export type GastoTipo = "factura" | "boleta" | "caja_chica"
export type GastoMedioPago = "efectivo" | "transferencia" | "tarjeta" | "cuenta_corriente"
export type GastoEstadoPago = "pendiente" | "pagado"
export type GastoEstadoImputacion = "pendiente" | "imputado"

export const GASTO_TIPO_LABELS: Record<GastoTipo, string> = {
  factura: "Factura",
  boleta: "Boleta",
  caja_chica: "Caja chica",
}

export const GASTO_MEDIO_PAGO_LABELS: Record<GastoMedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cuenta_corriente: "Cuenta corriente",
}

/** A qué tipo de mantenimiento corresponde el gasto. NULL = "no corresponde". */
export const GASTO_TIPO_MANTENIMIENTO_LABELS: Record<MantenimientoTipo, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
  proactivo: "Proactivo",
}

/** Rubros sugeridos (el campo es texto libre, esto solo alimenta el selector). */
export const GASTO_RUBROS = [
  "Repuestos",
  "Combustible",
  "Taller / mano de obra",
  "Neumáticos",
  "Lubricantes",
  "Peajes",
  "Seguros / patentes",
  "Librería / insumos",
  "Varios",
] as const

export interface MantenimientoGasto {
  id: string
  tipo: GastoTipo
  fecha: string
  fecha_carga: string | null
  mes_imputacion: string
  proveedor: string | null
  rubro: string | null
  tipo_mantenimiento: MantenimientoTipo | null
  monto: number
  medio_pago: GastoMedioPago | null
  numero_comprobante: string | null
  /** N° de orden de trabajo (OT) asociado, para seguimiento. Obligatorio si tipo=factura. */
  orden_trabajo: string | null
  cuenta_contable: string | null
  centro_costo: string | null
  dominio: string | null
  estado_pago: GastoEstadoPago
  estado_imputacion: GastoEstadoImputacion
  mail_enviado: boolean
  mail_enviado_at: string | null
  mail_error: string | null
  adjunto_urls: string[]
  observaciones: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Proveedor del catálogo de gastos de mantenimiento (reutilizable entre cargas). */
export interface MantenimientoProveedor {
  id: string
  nombre: string
  activo: boolean
  created_at: string
}

/** Indisponibilidad de flota por causa NO de mantenimiento (estado IND). */
export interface FlotaIndisponibilidad {
  id: string
  dominio: string
  fecha_desde: string
  fecha_hasta: string
  motivo: string | null
  created_at: string
}

/** Día en que una unidad efectivamente ruteó (para utilización / DRT). */
export interface DiaRuteo {
  dominio: string
  fecha: string
}

// ===== Matriz SKAP / Certificaciones SOP (R1.1.3) =====
export interface SopCertificacion {
  id: string
  empleado_id: string
  sop_codigo: string
  sop_titulo: string
  fecha_certificacion: string
  score: number | null
  aprobado: boolean
  vencimiento: string | null
  evidencia_url: string | null
  notas: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type EstadoCertificacion = "vigente" | "por_vencer" | "vencida" | "sin_certificar"

export interface SkapEmpleadoRow {
  empleado_id: string
  legajo: number
  nombre: string
  sector: string | null
  certificacion: SopCertificacion | null
  estado: EstadoCertificacion
  dias_para_vencer: number | null
}

export interface SkapMatriz {
  sop_codigo: string
  sop_titulo: string
  total_empleados: number
  vigentes: number
  por_vencer: number
  vencidas: number
  sin_certificar: number
  pct_cobertura: number
  rows: SkapEmpleadoRow[]
}

// ===== Pre-Ruta en Vivo (operativo SDR) =====
export interface PreRutaEquipoLive {
  dominio: string | null
  chofer: string
  legajo: number | null
  presente: boolean
  hora_ingreso: string | null
  matinal_marcada: boolean
  hora_matinal: string | null
  checklist_liberacion_hecho: boolean
  hora_liberacion: string | null
  resultado_checklist: "aprobado" | "rechazado" | null
  tml_minutos: number | null
  tml_estado: "ok" | "en_riesgo" | "fuera_meta" | "pendiente"
}

export interface PreRutaEnVivo {
  fecha: string
  resumen: {
    total_esperados: number
    presentes: number
    matinal_ok: number
    checklists_ok: number
    salidos: number
    en_riesgo: number
    fuera_meta: number
  }
  equipos: PreRutaEquipoLive[]
  meta_minutos: number
  ventana_pct: number
}

// ===== TML Foxtrot (Misiones) =====
export interface TmlFoxtrotEquipo {
  fecha: string
  camion_id: string
  dominio: string | null
  sucursal: "ELDORADO" | "IGUAZU" | null
  zona: string
  chofer: {
    empleado_id: string | null
    legajo: number | null
    nombre: string | null
    hora_marca: string | null
    foxtrot_driver_id: string | null
  }
  ayudante: {
    empleado_id: string | null
    legajo: number | null
    nombre: string | null
    hora_marca: string | null
    foxtrot_driver_id: string | null
  }
  hora_marca_equipo: string | null
  hora_inicio_ruta: string | null
  route_id: string | null
  tml_minutos_real: number | null
  tml_minutos_desde7: number | null
  estado: "ok" | "fuera_meta" | "sin_marca" | "sin_ruta"
}

export interface TmlFoxtrotResumen {
  equipos_totales: number
  equipos_con_tml: number
  promedio_real_min: number | null
  promedio_desde7_min: number | null
  peor_real_min: number | null
  mejor_real_min: number | null
  // Equipos dentro de meta (TML ≤ 30 min) según cada métrica. El % dentro de
  // meta (objetivo DPO ≥ 65%) = en_meta_X / equipos_con_tml.
  en_meta_real: number
  en_meta_desde7: number
}

export interface TmlFoxtrotDia {
  fecha: string
  meta_minutos: number
  resumen: TmlFoxtrotResumen
  por_sucursal: Record<"ELDORADO" | "IGUAZU", TmlFoxtrotResumen>
  equipos: TmlFoxtrotEquipo[]
}

// ===== TML Foxtrot — selección de período =====
export type TmlFoxtrotPeriodo = "dia" | "semana" | "mes" | "ytd" | "personalizado"

// Un punto de la tendencia diaria, con el detalle por sucursal para que el
// gráfico se pueda filtrar (Todas / Eldorado / Iguazú) sin recargar.
export interface TmlFoxtrotSerieDia {
  fecha: string
  total: TmlFoxtrotResumen
  eldorado: TmlFoxtrotResumen
  iguazu: TmlFoxtrotResumen
}

// Agregado por tripulante (chofer o ayudante) sobre todo el rango.
// El TML del camión es del chofer; el ayudante "hereda" el del equipo.
export interface TmlFoxtrotChoferAgg {
  empleado_id: string | null
  legajo: number | null
  nombre: string | null
  sucursal: "ELDORADO" | "IGUAZU" | null
  dias_con_ruta: number
  dias_como_chofer: number
  dias_como_ayudante: number
  dias_con_tml: number
  dias_fuera_meta: number
  dias_sin_marca: number
  tml_promedio_real: number | null
  tml_promedio_desde7: number | null
  tml_peor_real: number | null
  tml_mejor_real: number | null
  pct_dentro_meta: number | null
}

export interface TmlFoxtrotRango {
  periodo: TmlFoxtrotPeriodo
  desde: string
  hasta: string
  es_dia_unico: boolean
  // true si el rango incluye hoy: ese día usa el inicio en vivo (provisional)
  // porque la salida real (ROUTE_ANALYTICS) se consolida al cierre.
  incluye_hoy_provisional: boolean
  meta_minutos: number
  resumen: TmlFoxtrotResumen
  por_sucursal: Record<"ELDORADO" | "IGUAZU", TmlFoxtrotResumen>
  serie_diaria: TmlFoxtrotSerieDia[]
  // Poblado solo cuando es_dia_unico (vista detalle por equipo).
  equipos: TmlFoxtrotEquipo[]
  // Agregado por chofer sobre el rango (vista multi-día).
  choferes: TmlFoxtrotChoferAgg[]
}

// ===== TML comparativo YoY =====
export interface TmlMesComparado {
  mes: number
  mes_label: string
  promedio_tml_actual: number | null
  promedio_tml_anterior: number | null
  pct_dentro_meta_actual: number | null
  pct_dentro_meta_anterior: number | null
  delta_tml: number | null
}

// ===== Foxtrot integration =====
export interface FoxtrotRoute {
  route_id: string
  dc_id: string
  fecha: string
  driver_id: string
  driver_name: string
  vehicle_id: string | null
  dominio: string | null
  start_time: string | null
  end_time: string | null
  completion_type: string | null
  is_active: boolean | null
  is_finalized: boolean | null
  total_waypoints: number
  total_deliveries: number
  deliveries_successful: number
  deliveries_failed: number
  deliveries_visit_later: number
  deliveries_attempted: number
  tiempo_ruta_minutos: number | null
  driver_click_score: number | null
  adherencia_secuencia: number | null
  pct_tracking_activo: number | null
  raw_data: unknown
  last_synced: string
  created_at: string
  updated_at: string
}

export interface FoxtrotDriverLocation {
  id: string
  driver_id: string
  driver_name: string
  fecha: string
  timestamp: string
  latitud: number
  longitud: number
  created_at: string
}

export interface FoxtrotDriverMapping {
  id: string
  foxtrot_driver_id: string
  foxtrot_driver_name: string
  empleado_id: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface FoxtrotSyncLog {
  id: string
  started_at: string
  finished_at: string | null
  fecha: string
  rutas_sincronizadas: number
  posiciones_sincronizadas: number
  errores: number
  error_detalle: string | null
  ok: boolean
}

// ===== Gestión documental DPO (evidencia) =====
export type DpoActividadTipo =
  | "archivo_subido"
  | "archivo_version_nueva"
  | "archivo_editado"
  | "archivo_metadata_editada"
  | "archivo_archivado"
  | "archivo_desarchivado"
  | "archivo_eliminado"
  | "plan_creado"
  | "plan_actualizado"
  | "plan_cerrado"
  | "owd_creada"
  | "cert_subida"
  | "sop_actualizado"
  | "sync_foxtrot"
  | "registro_tml"
  | "otro"

export interface DpoArchivo {
  id: string
  pilar_codigo: string
  punto_codigo: string
  requisito_codigo: string | null
  titulo: string
  descripcion: string | null
  categoria: string | null
  file_name: string
  file_ext: string
  mime_type: string
  current_version: number
  current_file_path: string
  current_file_size: number
  uploaded_by: string | null
  archivado: boolean
  archived_at: string | null
  archived_by: string | null
  deleted_at: string | null
  deleted_by: string | null
  /** Edición online en curso (puente Google Drive): id del archivo en Drive. */
  edicion_drive_id: string | null
  edicion_drive_url: string | null
  edicion_iniciada_at: string | null
  edicion_iniciada_por_nombre: string | null
  created_at: string
  updated_at: string
}

export interface DpoArchivoVersion {
  id: string
  archivo_id: string
  version: number
  file_path: string
  file_name: string
  file_size: number
  notas: string | null
  uploaded_by: string | null
  created_at: string
}

export interface DpoActividad {
  id: string
  tipo: DpoActividadTipo
  pilar_codigo: string | null
  punto_codigo: string | null
  requisito_codigo: string | null
  archivo_id: string | null
  referencia_id: string | null
  referencia_tipo: string | null
  titulo: string
  descripcion: string | null
  user_id: string | null
  user_nombre: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface DpoPuntoResumen {
  pilar_codigo: string
  punto_codigo: string
  titulo: string
  total_archivos: number
  total_actividad: number
  ultimo_archivo: string | null
  ultima_actividad: string | null
}

export interface FoxtrotWaypointVisita {
  id: string
  route_id: string
  waypoint_id: string
  customer_id: string | null
  fecha: string
  status: string | null
  completed_timestamp: string | null
  estimated_time_of_arrival: string | null
  waiting_time_seconds: number | null
  waypoints_ahead: number | null
  created_at: string
  updated_at: string
}

export interface FoxtrotDeliveryAttempt {
  id: string
  route_id: string
  waypoint_id: string
  customer_id: string | null
  fecha: string
  delivery_id: string
  delivery_name: string | null
  delivery_quantity: number | null
  attempt_id: string | null
  attempt_status: string
  attempt_timestamp: string | null
  driver_notes: string | null
  delivery_code: string | null
  delivery_message: string | null
  created_at: string
}

export interface FoxtrotRechazoAgregado {
  key: string
  label: string
  count: number
  ejemplos: FoxtrotDeliveryAttempt[]
}

export interface FoxtrotDriverRow {
  driver_id: string
  driver_name: string
  dc_id: string
  rutas: number
  tiempo_productivo_minutos: number
  visitas_planeadas: number
  visitas_hechas: number
  visitas_exitosas: number
  visitas_fracasos: number
  visitas_reintentos: number
  tiempo_total_minutos: number
  ultima_ubicacion: { latitud: number; longitud: number; timestamp: string } | null
  route_ids: string[]
}

export interface FoxtrotDashboardMarker {
  customer_id: string | null
  latitud: number
  longitud: number
  status: "OK" | "FAIL" | "PENDING"
  driver_name: string
  delivery_count: number
}

export interface FoxtrotDashboardData {
  fecha: string
  kpis: {
    choferes: number
    rutas: number
    visitas: number
    exitosas: number
    reintentos: number
    rechazadas: number
    fracasadas_total: number
    visitas_planeadas: number
  }
  drivers: FoxtrotDriverRow[]
  driverLocations: FoxtrotDriverLocation[]
  warehousesLocation: { latitud: number; longitud: number } | null
  customersSummary: {
    total_clientes: number
    clientes_visitados: number
    clientes_pendientes: number
  }
}

export interface FoxtrotKpis {
  totalRutasMes: number
  pctTrackingActivoMes: number
  tiempoRutaPromedioMinutos: number
  tiempoRutaDentroMeta: number
  tiempoRutaPctDentroMeta: number
  rutasHoy: number
  rutasActivasAhora: number
  ultimaSincronizacion: string | null
  mensual: Array<{
    year: number
    mes: number
    total_rutas: number
    promedio_tiempo_ruta: number
    pct_tracking: number
  }>
}

// ===== Sugerencias y Mejoras =====
export type SugerenciaTipo = "bug" | "dato_incorrecto" | "mejora_ux" | "feature_request"
export type SugerenciaEstado =
  | "nuevo"
  | "en_analisis"
  | "en_desarrollo"
  | "en_testeo"
  | "ok"
  | "rechazado"
export type SugerenciaPrioridad = "baja" | "media" | "alta"

export interface Sugerencia {
  id: string
  titulo: string
  descripcion: string
  tipo: SugerenciaTipo
  estado: SugerenciaEstado
  prioridad: SugerenciaPrioridad
  modulo: string | null
  creado_por: string
  asignado_a: string | null
  motivo_rechazo: string | null
  created_at: string
  updated_at: string
}

export interface SugerenciaComentario {
  id: string
  sugerencia_id: string
  autor_id: string
  texto: string
  created_at: string
}

// Listado enriquecido con nombre del autor
export interface SugerenciaConAutor extends Sugerencia {
  autor_nombre: string
  asignado_nombre: string | null
}

export interface SugerenciaComentarioConAutor extends SugerenciaComentario {
  autor_nombre: string
}

export interface SugerenciaDetalle extends SugerenciaConAutor {
  comentarios: SugerenciaComentarioConAutor[]
}

// Labels en español
export const SUGERENCIA_ESTADO_LABELS: Record<SugerenciaEstado, string> = {
  nuevo: "Nuevo",
  en_analisis: "En análisis",
  en_desarrollo: "En desarrollo",
  en_testeo: "En testeo",
  ok: "OK",
  rechazado: "Rechazado",
}

export const SUGERENCIA_ESTADO_COLORS: Record<SugerenciaEstado, string> = {
  nuevo: "#64748B",
  en_analisis: "#3B82F6",
  en_desarrollo: "#8B5CF6",
  en_testeo: "#F59E0B",
  ok: "#10B981",
  rechazado: "#EF4444",
}

export const SUGERENCIA_TIPO_LABELS: Record<SugerenciaTipo, string> = {
  bug: "Bug",
  dato_incorrecto: "Dato incorrecto",
  mejora_ux: "Mejora UX",
  feature_request: "Feature request",
}

export const SUGERENCIA_TIPO_COLORS: Record<SugerenciaTipo, string> = {
  bug: "#EF4444",
  dato_incorrecto: "#F97316",
  mejora_ux: "#3B82F6",
  feature_request: "#8B5CF6",
}

export const SUGERENCIA_PRIORIDAD_LABELS: Record<SugerenciaPrioridad, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
}

export const SUGERENCIA_PRIORIDAD_COLORS: Record<SugerenciaPrioridad, string> = {
  baja: "#3B82F6",
  media: "#F59E0B",
  alta: "#EF4444",
}

// ===== Reportes de Seguridad =====
export type ReporteSeguridadTipo =
  | "accidente"
  | "incidente"
  | "acto_inseguro"
  | "ruta_riesgo"
  | "acto_seguro"

export type ReporteSeguridadLocalidad =
  | "san_nicolas"
  | "ramallo"
  | "pergamino"
  | "colon"
  | "otro"

export type ReporteSeguridadArea =
  | "deposito"
  | "distribucion"
  | "ventas"
  | "administracion"

export type ReporteSeguridadPuesto =
  | "ayudante_distribucion"
  | "chofer_distribucion"
  | "operario_deposito"
  | "promotor_ventas"
  | "repositor"
  | "administracion"
  | "mando_medio"
  | "otro"

export type ReporteSeguridadTipoSif =
  | "sif_actual"
  | "sif_potencial"
  | "sif_precursor"

export type ReporteSeguridadTipoAccidente =
  | "fat"
  | "lti"
  | "mdi"
  | "mti"
  | "fai"
  | "sio"
  | "sho"

export interface ReporteSeguridad {
  id: string
  tipo: ReporteSeguridadTipo
  fecha: string
  hora: string | null
  descripcion: string
  accion_tomada: string | null
  lugar: string | null
  localidad: ReporteSeguridadLocalidad | null
  area: ReporteSeguridadArea | null
  damnificado_nombre: string | null
  damnificado_puesto: ReporteSeguridadPuesto | null
  dentro_cd: boolean | null
  sif: boolean | null
  tipo_sif: ReporteSeguridadTipoSif | null
  tipo_accidente: ReporteSeguridadTipoAccidente | null
  quien_que: string | null
  creado_por: string
  created_at: string
  updated_at: string
}

export interface ReporteSeguridadAdjunto {
  id: string
  reporte_id: string
  storage_path: string
  mime_type: string
  tamaño_bytes: number
  created_at: string
}

export interface ReporteSeguridadConAutor extends ReporteSeguridad {
  autor_nombre: string
}

export interface ReporteSeguridadPlan {
  id: string
  reporte_id: string
  descripcion: string
  foto_path: string | null
  comentario_cierre: string | null
  fecha_planificada: string | null
  fecha_completado: string | null
  creado_por: string
  created_at: string
  updated_at: string
}

export interface ReporteSeguridadPlanEvidencia {
  id: string
  plan_id: string
  nombre_original: string | null
  storage_path: string
  mime_type: string
  tamaño_bytes: number
  creado_por: string
  created_at: string
}

export interface ReporteSeguridadPlanConFoto extends ReporteSeguridadPlan {
  foto_url: string | null
  evidencias: (ReporteSeguridadPlanEvidencia & { url: string })[]
}

export interface ReporteSeguridadDetalle extends ReporteSeguridadConAutor {
  adjuntos: (ReporteSeguridadAdjunto & { url: string })[]
  plan: ReporteSeguridadPlanConFoto | null
}

// Labels + colors
export const REPORTE_SEGURIDAD_TIPO_LABELS: Record<ReporteSeguridadTipo, string> = {
  accidente: "Accidente",
  incidente: "Incidente",
  acto_inseguro: "Acto / condición insegura",
  ruta_riesgo: "Ruta de riesgo",
  acto_seguro: "Acto seguro",
}

export const REPORTE_SEGURIDAD_TIPO_COLORS: Record<ReporteSeguridadTipo, string> = {
  accidente: "#DC2626",
  incidente: "#F97316",
  acto_inseguro: "#F59E0B",
  ruta_riesgo: "#8B5CF6",
  acto_seguro: "#10B981",
}

export const REPORTE_SEGURIDAD_LOCALIDAD_LABELS: Record<
  ReporteSeguridadLocalidad,
  string
> = {
  san_nicolas: "San Nicolás",
  ramallo: "Ramallo",
  pergamino: "Pergamino",
  colon: "Colón",
  otro: "Otro",
}

export const REPORTE_SEGURIDAD_AREA_LABELS: Record<ReporteSeguridadArea, string> = {
  deposito: "Depósito",
  distribucion: "Distribución",
  ventas: "Ventas",
  administracion: "Administración",
}

export const REPORTE_SEGURIDAD_PUESTO_LABELS: Record<ReporteSeguridadPuesto, string> = {
  ayudante_distribucion: "Ayudante distribución",
  chofer_distribucion: "Chofer distribución",
  operario_deposito: "Operario depósito",
  promotor_ventas: "Promotor / ventas",
  repositor: "Repositor",
  administracion: "Administración",
  mando_medio: "Mando medio",
  otro: "Otro",
}

export const REPORTE_SEGURIDAD_TIPO_SIF_LABELS: Record<
  ReporteSeguridadTipoSif,
  string
> = {
  sif_actual: "SIF Actual",
  sif_potencial: "SIF Potencial",
  sif_precursor: "SIF Precursor",
}

export const REPORTE_SEGURIDAD_TIPO_ACCIDENTE_LABELS: Record<
  ReporteSeguridadTipoAccidente,
  string
> = {
  fat: "FAT — Fatality",
  lti: "LTI — Lost Time Injury",
  mdi: "MDI — Medical Day(s) Injury",
  mti: "MTI — Medical Treatment Injury",
  fai: "FAI — First Aid Injury",
  sio: "SIO — Serious Incident Outcome",
  sho: "SHO — Serious Health Outcome",
}

// ===== Notificaciones =====
export interface Notificacion {
  id: string
  user_id: string
  tipo: string
  titulo: string
  mensaje: string | null
  link: string | null
  leida: boolean
  created_at: string
}

// ===== 5S (Cinco eses) =====
export type S5Tipo = "flota" | "almacen"

export type S5Categoria =
  | "organizacion"
  | "orden"
  | "limpieza"
  | "estandarizacion"
  | "disciplina"

export type S5AuditoriaEstado = "borrador" | "completada"

export interface S5ItemCatalogo {
  id: string
  tipo: S5Tipo
  categoria: S5Categoria
  numero: number
  titulo: string
  descripcion: string
  orden: number
  activo: boolean
}

export interface S5SectorAlmacen {
  numero: number
  nombre: string
  updated_at: string
  updated_by: string | null
}

export interface S5SectorResponsable {
  id: string
  periodo: string // DATE (YYYY-MM-01)
  sector_numero: number
  empleado_id: string
  nombre: string | null
  asignado_por: string | null
  created_at: string
  updated_at: string
}

export interface S5SectorResponsableFull extends S5SectorResponsable {
  empleado_nombre: string
  empleado_legajo: number | null
}

export interface S5Auditor {
  id: string
  nombre: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface S5Auditoria {
  id: string
  tipo: S5Tipo
  periodo: string
  fecha: string
  auditor_id: string | null
  auditor_externo_id: string | null
  vehiculo_id: string | null
  chofer_nombre: string | null
  chofer_id: string | null
  ayudante_1: string | null
  ayudante_id: string | null
  ayudante_2: string | null
  sector_numero: number | null
  responsable_id: string | null
  estado: S5AuditoriaEstado
  nota_total: number | null
  notas_por_s: Record<S5Categoria, number> | null
  observaciones_generales: string | null
  evidencia_storage_path: string | null
  created_at: string
  updated_at: string
}

export interface S5AuditoriaItem {
  id: string
  auditoria_id: string
  item_id: string
  puntaje: number | null
  observaciones: string | null
}

export interface S5ItemFoto {
  id: string
  auditoria_item_id: string
  storage_path: string
  mime_type: string
  tamano_bytes: number
  subido_por: string
  created_at: string
}

export interface S5AuditoriaItemConCatalogo extends S5AuditoriaItem {
  catalogo: S5ItemCatalogo
  fotos: S5ItemFoto[]
}

export interface S5AuditoriaConMeta extends S5Auditoria {
  auditor_nombre: string
  vehiculo_dominio: string | null
  ayudante_nombre: string | null
  chofer_nombre_resuelto: string | null
  /** Responsable del sector, guardado en la auditoría al crearla. */
  responsable_nombre: string | null
}

/** Empleado candidato al sorteo mensual de responsables de sector. */
export interface S5Elegible {
  id: string
  legajo: number
  nombre: string
  elegible: boolean
  /** Veces que fue designado responsable de algún sector, histórico. */
  veces_designado: number
  /** Último período en que le tocó, o null si nunca. */
  ultimo_periodo: string | null
}

export interface S5RankingAyudanteRow {
  empleado_id: string | null
  nombre: string
  cantidad_audits: number
  nota_total_promedio: number
  notas_por_s_promedio: Record<S5Categoria, number>
}

// ── Ranking de ayudantes de DEPÓSITO (bimestral, fórmula editable) ──
export interface S5AyudantesConfig {
  peso_errores: number
  peso_5s: number
  peso_productividad: number
  /** Bultos errados acumulados en la ventana que valen 0 puntos. */
  tope_errores: number
  /** bul/HH que vale 100 puntos de productividad (picking). */
  prod_target: number
  /** Pal/HH que vale 100 puntos de productividad (maquinistas). */
  prod_target_maq: number
  meses_ventana: number
}

export interface S5AyudanteDepositoRow {
  empleado_id: string | null
  nombre: string
  es_picker: boolean
  es_maquinista: boolean
  es_responsable: boolean
  /** Sectores que tuvo asignados en la ventana (ej. "Nave"). */
  sectores: string[]
  nota_5s: number | null
  /** Cantidad de errores HUMANOS (filas del Sheet) acumulados en la ventana. */
  errores_cant: number | null
  errores_score: number | null
  /** bul/HH promedio de picking en la ventana. */
  productividad: number | null
  /** Pal/HH promedio como maquinista en la ventana. */
  productividad_maq: number | null
  /** Puntaje 0-100 combinado (promedio de picking y maquinista disponibles). */
  productividad_score: number | null
  score: number
  /** Posición sugerida por la fórmula (1..3) o null si fuera del podio. */
  posicion_sugerida: number | null
}

export type S5PremioArea = "deposito" | "distribucion"

export interface S5AyudantePremio {
  id: string
  periodo_desde: string
  area: S5PremioArea
  posicion: number
  empleado_id: string | null
  nombre: string
  score: number | null
  origen: "auto" | "manual"
}

export interface S5RankingDepositoData {
  periodo_desde: string
  periodo_hasta: string
  meses: string[]
  ranking: S5AyudanteDepositoRow[]
  premios_deposito: S5AyudantePremio[]
  premios_distribucion: S5AyudantePremio[]
  fotos_ganadores: { deposito: string | null; distribucion: string | null }
  config: S5AyudantesConfig
}

export interface S5AuditoriaFull extends S5AuditoriaConMeta {
  items: S5AuditoriaItemConCatalogo[]
}

export interface S5VehiculoPendiente {
  id: string
  dominio: string
  descripcion: string | null
}

// Labels / colors
export const S5_TIPO_LABELS: Record<S5Tipo, string> = {
  flota: "Flota",
  almacen: "Almacén",
}

export const S5_CATEGORIA_LABELS: Record<S5Categoria, string> = {
  organizacion: "Organización",
  orden: "Orden",
  limpieza: "Limpieza",
  estandarizacion: "Estandarización",
  disciplina: "Disciplina",
}

// Nombres S japoneses
export const S5_CATEGORIA_S_LABELS: Record<S5Categoria, string> = {
  organizacion: "1ra S - Seiri",
  orden: "2da S - Seiton",
  limpieza: "3ra S - Seiso",
  estandarizacion: "4ta S - Seiketsu",
  disciplina: "5ta S - Shitsuke",
}

export const S5_CATEGORIA_COLORS: Record<S5Categoria, string> = {
  organizacion: "#3B82F6",
  orden: "#10B981",
  limpieza: "#06B6D4",
  estandarizacion: "#8B5CF6",
  disciplina: "#F59E0B",
}

export const S5_CATEGORIA_ORDEN: S5Categoria[] = [
  "organizacion",
  "orden",
  "limpieza",
  "estandarizacion",
  "disciplina",
]

// Puntajes válidos por tipo
export const S5_PUNTAJES_ALMACEN: { valor: number; label: string }[] = [
  { valor: 0, label: "Muy Malo" },
  { valor: 1, label: "Malo" },
  { valor: 2, label: "Regular" },
  { valor: 3, label: "Bueno" },
  { valor: 4, label: "Muy Bueno" },
]

export const S5_PUNTAJES_FLOTA: { valor: number; label: string }[] = [
  { valor: 0, label: "No OK" },
  { valor: 1, label: "Precisa acciones" },
  { valor: 3, label: "OK" },
]

export const S5_MAX_PUNTAJE: Record<S5Tipo, number> = {
  flota: 3,
  almacen: 4,
}

export const S5_AUDITORIA_ESTADO_LABELS: Record<S5AuditoriaEstado, string> = {
  borrador: "Borrador",
  completada: "Completada",
}

export const S5_AUDITORIA_ESTADO_COLORS: Record<S5AuditoriaEstado, string> = {
  borrador: "#64748B",
  completada: "#10B981",
}

// ===== 5S Acciones (tareas con evidencia con historial) =====
export type S5AccionEstado = "no_comenzada" | "en_curso" | "cerrada"

export interface S5Accion {
  id: string
  tipo: S5Tipo
  sector_numero: number | null
  vehiculo_id: string | null
  descripcion: string
  responsable_id: string | null
  fecha_compromiso: string | null
  estado: S5AccionEstado
  origen_auditoria_id: string | null
  origen_reunion_actividad_id: string | null
  creado_por: string
  cerrada_at: string | null
  cerrada_por: string | null
  created_at: string
  updated_at: string
}

export interface S5AccionConMeta extends S5Accion {
  responsable_nombre: string | null
  creado_por_nombre: string | null
  cerrada_por_nombre: string | null
  vehiculo_dominio: string | null
  evidencias_count: number
  /** reunion_id de la actividad origen (si fue espejada desde reuniones). */
  origen_reunion_id?: string | null
}

export interface S5AccionEvidencia {
  id: string
  accion_id: string
  comentario: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  autor_id: string
  autor_nombre: string | null
  created_at: string
}

export const S5_ACCION_ESTADO_LABELS: Record<S5AccionEstado, string> = {
  no_comenzada: "No comenzada",
  en_curso: "En curso",
  cerrada: "Cerrada",
}

export const S5_ACCION_ESTADO_COLORS: Record<S5AccionEstado, string> = {
  no_comenzada: "#64748B",
  en_curso: "#F59E0B",
  cerrada: "#10B981",
}

// ===== 5S Indicadores =====
export interface S5KpisMes {
  promedio_nota: number | null
  total_auditorias: number
  pendientes: number
  promedio_mes_anterior: number | null
  mejor_nombre: string | null
  mejor_nota: number | null
  peor_nombre: string | null
  peor_nota: number | null
  items_criticos_count: number
}

export interface S5TendenciaMes {
  periodo: string // YYYY-MM-01
  mes_label: string
  organizacion: number | null
  orden: number | null
  limpieza: number | null
  estandarizacion: number | null
  disciplina: number | null
  total: number | null
}

export interface S5RankingRow {
  id: string
  nombre: string
  nota_total: number
  estado: S5AuditoriaEstado
}

export interface S5ItemCriticoRow {
  item_id: string
  numero: number
  titulo: string
  categoria: S5Categoria
  promedio_pct: number
  veces_evaluado: number
  observacion_comun: string | null
}

// ===== Línea Ética =====
export type LineaEticaTipo =
  | "conducta_indebida"
  | "acoso"
  | "discriminacion"
  | "corrupcion"
  | "fraude"
  | "conflicto_interes"
  | "represalia"
  | "otro"

export type LineaEticaEstado =
  | "nueva"
  | "en_revision"
  | "en_tratamiento"
  | "cerrada"

export interface DenunciaLineaEtica {
  id: string
  tipo: LineaEticaTipo
  descripcion: string
  lugar: string | null
  area: ReporteSeguridadArea | null
  localidad: ReporteSeguridadLocalidad | null
  fecha_hecho: string | null
  identificarse: boolean
  denunciante_nombre: string | null
  denunciante_contacto: string | null
  estado: LineaEticaEstado
  resumen_tratamiento: string | null
  cerrada_por: string | null
  cerrada_at: string | null
  created_at: string
  updated_at: string
}

export interface LineaEticaAdjunto {
  id: string
  denuncia_id: string
  origen: "denuncia" | "tratamiento"
  storage_path: string
  mime_type: string
  tamaño_bytes: number
  subido_por: string | null
  created_at: string
}

export interface LineaEticaPlanAccion {
  id: string
  denuncia_id: string
  plan_id: string
  created_at: string
  created_by: string | null
}

export interface DenunciaLineaEticaDetalle extends DenunciaLineaEtica {
  adjuntos: (LineaEticaAdjunto & { url: string })[]
  planes: {
    id: string
    plan_id: string
    descripcion: string
    responsable: string
    fecha_limite: string | null
    estado: string
    progreso: number
  }[]
}

export const LINEA_ETICA_TIPO_LABELS: Record<LineaEticaTipo, string> = {
  conducta_indebida: "Conducta indebida",
  acoso: "Acoso",
  discriminacion: "Discriminación",
  corrupcion: "Corrupción / soborno",
  fraude: "Fraude",
  conflicto_interes: "Conflicto de interés",
  represalia: "Represalia",
  otro: "Otro",
}

export const LINEA_ETICA_ESTADO_LABELS: Record<LineaEticaEstado, string> = {
  nueva: "Nueva",
  en_revision: "En revisión",
  en_tratamiento: "En tratamiento",
  cerrada: "Cerrada",
}

export const LINEA_ETICA_ESTADO_COLORS: Record<LineaEticaEstado, string> = {
  nueva: "#DC2626",
  en_revision: "#F59E0B",
  en_tratamiento: "#3B82F6",
  cerrada: "#10B981",
}

export type UserWithStats = Profile & {
  last_sign_in_at: string | null
  email_confirmed_at: string | null
}

// =============================================================================
// Orden de Salida Diario — módulo /orden-salida (migración 041)
// =============================================================================

export type SucursalOrdenSalida = "ELDORADO" | "IGUAZU"

export type EstadoCamionDiario =
  | "operativo"
  | "sin_asignar"
  | "sin_carga"
  | "fuera_servicio"
  | "taller"

export type MotivoNoSale =
  | "deposito"
  | "vacaciones"
  | "licencia"
  | "ausente"
  | "suspendido"
  | "franco"
  | "otro"

// Camión + datos de flota (sucursal, capacidad, número), tal como llegan
// del select que joinea catalogo_vehiculos ⨝ orden_salida_flota.
export interface CamionFlota {
  id: string                // catalogo_vehiculos.id
  patente: string           // catalogo_vehiculos.dominio
  sucursal: SucursalOrdenSalida
  capacidad_kg: number | null
  numero_unidad: number | null
  activo: boolean
}

// Empleado tal como lo necesita el módulo. Incluye sucursal (col nueva en
// empleados) y la patente del camión titular si tiene uno asignado.
export interface EmpleadoOrdenSalida {
  id: string
  legajo: number | null
  nombre: string
  sector: string | null
  puesto: string | null
  sucursal: SucursalOrdenSalida | null
  activo: boolean
  camion_fijo_patente: string | null
}

export interface AsignacionCamionDiario {
  fecha: string                          // YYYY-MM-DD
  camion_id: string
  chofer_empleado_id: string | null
  ayudante_empleado_id: string | null
  zona: string
  estado: EstadoCamionDiario
  observacion: string
  clientes: number | null
  sobrecarga_completa: number | null
  media_sobrecarga: number | null
  cuarto_sobrecarga: number | null
  bultos: number | null
}

export interface PersonalNoSaleDiario {
  fecha: string
  empleado_id: string
  motivo: MotivoNoSale
  detalle: string
}

// Vista empleado: lo que el empleado autenticado ve para una fecha dada.
// Resultado discriminado para que el cliente renderee 3 casos distintos.
export type MiOrdenDelDia =
  | {
      tipo: "asignacion"
      fecha: string
      rol: "chofer" | "ayudante"
      camion_patente: string
      zona: string
      observacion: string
    }
  | {
      tipo: "no_sale"
      fecha: string
      motivo: MotivoNoSale
      detalle: string
    }
  | {
      tipo: "sin_definir"
      fecha: string
    }

// =============================================
// Requisitos Legales (DPO Planeamiento 2.1)
// =============================================
export type EstadoRequisitoLegal = "vigente" | "por_vencer" | "vencido"

export type TipoIdentificadorRequisito =
  | "ninguno"
  | "vehiculo"
  | "persona"
  | "ubicacion"
  | "proveedor"

export interface RequisitoLegalCategoria {
  id: string
  nombre: string
  slug: string
  tipo_identificador: TipoIdentificadorRequisito
  identificador_label: string | null
  responsable_principal_id: string | null
  orden: number
  activa: boolean
  created_at: string
  updated_at: string
}

export interface RequisitoLegal {
  id: string
  categoria_id: string
  nombre: string
  fecha_emision: string | null
  fecha_vencimiento: string
  responsable_id: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  archivo_url_2: string | null
  archivo_nombre_2: string | null
  observaciones: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RequisitoLegalConResponsable extends RequisitoLegal {
  responsable_nombre: string | null
  responsable_email: string | null
  estado: EstadoRequisitoLegal
  dias_para_vencer: number
}

export interface RequisitoLegalAlertaConfig {
  id: string
  email: string
  nombre: string
  activo: boolean
  created_at: string
}

export type RaciLetra = "R" | "A" | "C" | "I"

export interface RequisitoLegalRaciRol {
  id: string
  nombre: string
  orden: number
  activa: boolean
  created_at: string
}

export interface RequisitoLegalRaciFila {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
  activa: boolean
  /** rol_id → letra RACI */
  asignaciones: Record<string, RaciLetra>
  created_at: string
  updated_at: string
}

export interface RequisitoLegalRaci {
  roles: RequisitoLegalRaciRol[]
  filas: RequisitoLegalRaciFila[]
}

// =============================================
// Presupuesto (módulo /presupuesto)
// =============================================
export type EstadoPresupuestoTarea = "pendiente" | "en_progreso" | "completada"

export interface PresupuestoAnual {
  id: string
  anio: number
  archivo_url: string | null
  archivo_nombre: string | null
  observaciones: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PresupuestoEerrAnual {
  id: string
  anio: number
  archivo_url: string | null
  archivo_nombre: string | null
  observaciones: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PresupuestoTarea {
  id: string
  anio: number
  mes: number
  rubro: string
  monto_presupuestado: number | null
  monto_real: number | null
  descripcion: string | null
  responsable_id: string | null
  fecha_limite: string | null
  estado: EstadoPresupuestoTarea
  /** Primer archivo de la evidencia (compatibilidad con lectores viejos). */
  evidencia_url: string | null
  evidencia_nombre: string | null
  /** Todas las evidencias de la tarea. Se acumulan: responder no pisa las anteriores. */
  evidencia_urls: string[]
  evidencia_nombres: string[]
  justificacion: string | null
  completada_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PresupuestoTareaConResponsable extends PresupuestoTarea {
  responsable_nombre: string | null
  responsable_email: string | null
  desvio_pct: number | null // calculado: (real - presup)/presup * 100, null si presup es null/0
}

// =============================================
// Iniciativas de Ahorro (Rutina de Campeones 5.2) — solo Pampeana
// =============================================
export type TipoIniciativaAhorro =
  | "hhee"
  | "ausentismo"
  | "mermas_wh_del"
  | "ocupacion_capacidad"
  | "productividad_wh_del"
  | "renovacion_flota"
  | "cambio_glp"
  | "consumo_combustible"
  | "otro"

export type EstadoIniciativaAhorro =
  | "planificada"
  | "en_implementacion"
  | "implementada"
  | "cancelada"

export type DireccionKpiIniciativa = "menor" | "mayor"

export interface IniciativaAhorroSeguimiento {
  id: string
  iniciativa_id: string
  anio: number
  trimestre: number // 1..4
  ahorro_real: number | null
  kpi_valor: number | null
  comentario: string | null
  evidencia_url: string | null
  evidencia_nombre: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface IniciativaAhorro {
  id: string
  anio: number
  tipo: TipoIniciativaAhorro
  tipo_otro: string | null
  titulo: string
  descripcion: string | null
  responsable_id: string | null
  fecha_implementacion: string | null
  ahorro_comprometido_anual: number | null
  /** Rubro del EERR sobre el que se calcula la meta. NULL = compromiso a mano. */
  rubro: string | null
  /** % del presupuesto anual del rubro que se compromete ahorrar (ej. 70). */
  ahorro_pct_objetivo: number | null
  /** Presupuesto anual del rubro con el que se calculó la meta (snapshot). */
  presupuesto_rubro_anual: number | null
  kpi_nombre: string | null
  kpi_unidad: string | null
  kpi_linea_base: number | null
  kpi_objetivo: number | null
  kpi_mejor_si: DireccionKpiIniciativa
  incluida_en_presupuesto: boolean
  estado: EstadoIniciativaAhorro
  observaciones: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface IniciativaAhorroConDetalle extends IniciativaAhorro {
  responsable_nombre: string | null
  responsable_email: string | null
  seguimientos: IniciativaAhorroSeguimiento[]
}

// =============================================
// Planes de Acción del Presupuesto — solo Pampeana
// =============================================
export type EstadoPlanAccion =
  | "abierto"
  | "en_progreso"
  | "cerrado"
  | "cancelado"

export type EstadoPasoPlanAccion =
  | "pendiente"
  | "en_progreso"
  | "completado"

export interface PlanAccionPaso {
  id: string
  plan_id: string
  orden: number
  que: string
  como: string | null
  responsable_id: string | null
  fecha_limite: string | null
  estado: EstadoPasoPlanAccion
  avance: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  responsable_nombre: string | null
}

export interface PlanAccionPresupuesto {
  id: string
  anio: number
  tarea_id: string | null
  titulo: string
  desvio_detectado: string | null
  causa_raiz: string | null
  responsable_id: string | null
  fecha_limite: string | null
  estado: EstadoPlanAccion
  observaciones: string | null
  adjunto_urls: string[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PlanAccionPresupuestoConDetalle extends PlanAccionPresupuesto {
  responsable_nombre: string | null
  responsable_email: string | null
  // Datos de la tarea de análisis vinculada (si la hay)
  tarea_rubro: string | null
  tarea_mes: number | null
  pasos: PlanAccionPaso[]
}

// =============================================
// Inversiones del Presupuesto — solo Pampeana
// =============================================
export type CategoriaInversion =
  | "flota"
  | "equipos_almacen"
  | "tecnologia"
  | "infraestructura"
  | "otro"

export type EstadoInversion =
  | "programada"
  | "aprobada"
  | "en_curso"
  | "realizada"
  | "cancelada"

export interface Inversion {
  id: string
  anio: number
  titulo: string
  categoria: CategoriaInversion
  cantidad: number | null
  descripcion: string | null
  beneficio_esperado: string | null
  kpi_nombre: string | null
  kpi_unidad: string | null
  kpi_objetivo: number | null
  proveedor: string | null
  fecha_programada: string | null
  monto_estimado: number | null
  estado: EstadoInversion
  fecha_realizada: string | null
  monto_real: number | null
  evidencia_url: string | null
  evidencia_nombre: string | null
  responsable_id: string | null
  observaciones: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface InversionConDetalle extends Inversion {
  responsable_nombre: string | null
  responsable_email: string | null
}

// =============================================
// Reuniones (módulo /reuniones)
// =============================================
export type TipoReunion =
  | "logistica"
  | "logistica-ventas"
  | "matinal-distribucion"
  | "warehouse"
  | "presupuesto"
  | "mantenimiento"

// --- TOR (Términos de Referencia) por tipo de reunión ---

export type TorFrecuencia = "diaria" | "semanal" | "mensual"

export interface TorTemarioItem {
  tema: string
  quien: string
}

export interface TorContenido {
  nombre: string
  objetivos: string
  dueno: string[]
  participantes: string[]
  ubicacion: string[]
  duracion: string
  frecuencia_texto: string
  reglas: string[]
  entradas: string[]
  salidas: string[]
  kpis: string[]
  temario: TorTemarioItem[]
}

export interface ReunionTor {
  id: string
  tipo: TipoReunion
  frecuencia: TorFrecuencia
  contenido: TorContenido
  updated_at: string
}

export type EstadoReunionCompromiso = "pendiente" | "en_progreso" | "completado"

export interface ReunionTipoConfig {
  tipo: TipoReunion
  nombre: string
  dias_semana: number[]
  created_at: string
  updated_at: string
}

export interface ReunionParticipanteFijo {
  id: string
  tipo: TipoReunion
  profile_id: string
  created_at: string
}

export interface ReunionParticipanteFijoConProfile extends ReunionParticipanteFijo {
  profile_nombre: string
  profile_email: string | null
}

export interface Reunion {
  id: string
  tipo: TipoReunion
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  lugar: string | null
  agenda: string | null
  notas: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type OrigenAsistencia = "manual" | "preruta"

export interface ReunionAsistente {
  id: string
  reunion_id: string
  profile_id: string
  presente: boolean
  justificacion: string | null
  /** 'preruta' = derivado del check-in en la app de Reunión Pre-Ruta */
  origen: OrigenAsistencia
  created_at: string
}

export interface ReunionAsistenteConProfile extends ReunionAsistente {
  profile_nombre: string
  profile_email: string | null
}

export interface ReunionCompromiso {
  id: string
  reunion_id: string
  descripcion: string
  responsable_id: string | null
  fecha_compromiso: string | null
  estado: EstadoReunionCompromiso
  evidencia_url: string | null
  evidencia_nombre: string | null
  observaciones: string | null
  completado_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ReunionCompromisoConResponsable extends ReunionCompromiso {
  responsable_nombre: string | null
}

export interface ReunionArchivo {
  id: string
  reunion_id: string
  archivo_url: string
  archivo_nombre: string
  descripcion: string | null
  uploaded_by: string | null
  created_at: string
}

export interface ReunionConResumen extends Reunion {
  total_asistentes: number
  asistentes_presentes: number
  total_compromisos: number
  compromisos_pendientes: number
}

export interface ReunionDetalle extends Reunion {
  asistentes: ReunionAsistenteConProfile[]
  compromisos: ReunionCompromisoConResponsable[]
  archivos: ReunionArchivo[]
}

// =============================================
// Reuniones v3: actividades (renombre de compromisos) + indicadores
// =============================================
export type EstadoReunionActividad = "no_comenzada" | "en_curso" | "cerrada"

// Destino de una actividad del action log de reuniones.
// 'simple'  → tarea aislada en reuniones (default, comportamiento legacy).
// '5s_*'    → espejo bidireccional en s5_acciones.
// 'mantenimiento_edilicio' → placeholder Fase 2 (texto libre).
export type TareaDestino =
  | "simple"
  | "5s_flota"
  | "5s_almacen"
  | "mantenimiento_edilicio"

export interface ReunionActividad {
  id: string
  reunion_id: string
  descripcion: string
  motivo: string | null
  responsable_id: string | null
  fecha_compromiso: string | null
  estado: EstadoReunionActividad
  evidencia_url: string | null
  evidencia_nombre: string | null
  observaciones: string | null
  completado_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  destino: TareaDestino
  s5_sector_numero: number | null
  s5_vehiculo_id: string | null
  mantenimiento_rubro: string | null
  // Sección/indicador de la reunión al que pertenece (ej. 'rechazos'). NULL =
  // action log general (temas fuera de las secciones).
  seccion: string | null
}

export interface ReunionActividadConResponsable extends ReunionActividad {
  responsable_nombre: string | null
  reunion_origen_fecha: string
  reunion_origen_id: string
}

// Entrada del historial de avances de una actividad del Action Log.
// Cada avance es un comentario + archivo opcional, con fecha y autor.
export interface ReunionActividadEvidencia {
  id: string
  actividad_id: string
  comentario: string | null
  /** Todos los adjuntos del avance. Los avances viejos traen acá su único archivo. */
  archivos: ArchivoAvance[]
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: EstadoReunionActividad | null
  autor_id: string | null
  created_at: string
}

export interface ReunionActividadEvidenciaConAutor
  extends ReunionActividadEvidencia {
  autor_nombre: string | null
}

export type AgregacionIndicador = "suma" | "promedio"

export interface ReunionIndicadorConfig {
  id: string
  tipo: TipoReunion
  nombre: string
  unidad: string | null
  meta: number | null
  gatillo: number | null
  mejor_si: "mayor" | "menor" | "sin" | null
  orden: number
  activo: boolean
  agregacion: AgregacionIndicador
  created_at: string
  updated_at: string
}

export interface ReunionIndicadoresMes {
  anio: number
  mes: number
  fechas: string[]
  reuniones_por_fecha: Record<string, string | null>
  indicadores: Array<{
    id: string
    nombre: string
    unidad: string | null
    meta: number | null
    /** Valor de referencia "gatillo" (umbral rojo) inyectado desde la config. Se muestra como columna al lado de Target. */
    gatillo?: number | null
    orden: number
    agregacion: AgregacionIndicador
    valores: Record<
      string,
      {
        reunion_id: string
        valor: number | null
        observacion: string | null
        /** Texto a mostrar en la celda en vez del número (ej. "8/8" del indicador Checklist). */
        texto?: string | null
      } | null
    >
    mtd: number | null
    /** Texto a mostrar en la columna MTD en vez del número (filas con `texto` por celda). */
    mtd_texto?: string | null
    /** Si true, la fila viene calculada por el sistema (no editable) — p.ej. LTI/TRI desde reportes_seguridad. */
    auto?: boolean
    /** Si true, una celda con valor 0 también se muestra (no se oculta como "—"). Útil para tasas/% donde 0% es info válida. */
    mostrar_cero?: boolean
    /** Para filas auto con meta: define la polaridad del cumplimiento. "menor" = mejor cuando valor ≤ meta (ej. Rechazos %); "mayor" = mejor cuando valor ≥ meta (ej. Bultos vendidos). */
    mejor_si?: "menor" | "mayor"
  }>
}

export interface ReunionIndicadorValor {
  id: string
  reunion_id: string
  indicador_id: string
  valor: number | null
  observacion: string | null
  registrado_por: string | null
  created_at: string
  updated_at: string
}

export interface ReunionIndicadorConValor extends ReunionIndicadorConfig {
  valor_actual: number | null
  valor_id: string | null
  observacion_actual: string | null
}

// =============================================
// Riesgos Externos — Plan de Acción (DPO Planeamiento 2.2)
// =============================================
export type TipoRiesgoExterno =
  | "corte_de_luz"
  | "falla_en_generador"
  | "corte_de_sistema"
  | "corte_de_internet"
  | "corte_de_ruta_o_acceso"
  | "incendio"
  | "paro_sindical"
  | "emergencia_medica_interna"
  | "emergencia_medica_externa"
  | "temporal"
  | "robo_warehouse"
  | "robo_distribucion"
  | "saqueos"
  | "clausura_del_predio"
  | "no_apertura_de_caja"
  | "amenaza_de_bomba"
  | "pandemia"
  | "invasion_de_plagas"

export type EstadoRiesgoExterno =
  | "no_iniciado"
  | "en_curso"
  | "concluido"
  | "concluido_con_atraso"
  | "atrasado"

export const TIPO_RIESGO_EXTERNO_LABELS: Record<TipoRiesgoExterno, string> = {
  corte_de_luz: "Corte de luz",
  falla_en_generador: "Falla en generador",
  corte_de_sistema: "Corte de sistema",
  corte_de_internet: "Corte de internet",
  corte_de_ruta_o_acceso: "Corte de ruta o acceso principal",
  incendio: "Incendio",
  paro_sindical: "Paro sindical",
  emergencia_medica_interna: "Emergencia médica (accidente interno)",
  emergencia_medica_externa: "Emergencia médica (accidente externo)",
  temporal: "Temporal",
  robo_warehouse: "Robo (Warehouse)",
  robo_distribucion: "Robo (Distribución)",
  saqueos: "Saqueos",
  clausura_del_predio: "Clausura del predio",
  no_apertura_de_caja: "No apertura de caja",
  amenaza_de_bomba: "Amenaza de bomba",
  pandemia: "Pandemia / Covid-19",
  invasion_de_plagas: "Invasión de plagas",
}

export const ESTADO_RIESGO_EXTERNO_LABELS: Record<EstadoRiesgoExterno, string> = {
  no_iniciado: "No iniciado",
  en_curso: "En curso",
  concluido: "Concluido",
  concluido_con_atraso: "Concluido con atraso",
  atrasado: "Atrasado",
}

export interface RiesgoExternoAccion {
  id: string
  nro_correlativo: number
  tipo_riesgo: TipoRiesgoExterno
  observaciones: string
  resolucion: string | null
  fecha_ocurrencia: string
  responsable_id: string | null
  tarea_pendiente: string | null
  fecha_compromiso: string | null
  fecha_cierre_real: string | null
  estado: EstadoRiesgoExterno
  semana: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RiesgoExternoAccionConResponsable extends RiesgoExternoAccion {
  responsable_nombre: string | null
  responsable_email: string | null
}

// ==================== HERRAMIENTAS DE GESTIÓN ====================
// 5 Porqués, Causa-Efecto (Ishikawa) y PDCA aplicadas a un plan/tarea.

export type HerramientaGestionTipo = "cinco_porques" | "causa_efecto" | "pdca"

export interface CincoPorquesContenido {
  problema: string
  porques: { pregunta: string; respuesta: string }[]
  causa_raiz: string
  contramedida: string
}

export interface CausaEfectoContenido {
  problema: string
  efecto: string
  categorias: { nombre: string; causas: string[] }[]
  causa_raiz: string
  contramedida?: string
}

export interface PdcaContenido {
  plan: { problema: string; brechas: string; objetivos: string; causas: string }
  hacer: { acciones: string }
  verificar: { resultados: string }
  actuar: { estandarizacion: string }
}

export type HerramientaGestionContenido =
  | CincoPorquesContenido
  | CausaEfectoContenido
  | PdcaContenido

export interface HerramientaGestion {
  id: string
  // Target: exactamente uno de plan_id / reunion_actividad_id / reporte_seguridad_id.
  plan_id: string | null
  reunion_actividad_id: string | null
  reporte_seguridad_id: string | null
  tipo: HerramientaGestionTipo
  titulo: string
  contenido: HerramientaGestionContenido
  // Solo aplica cuando target = reporte de seguridad: si true, la contramedida
  // se vuelca al plan de acción del reporte.
  contramedida_completada: boolean
  pdf_path: string | null
  autor_id: string | null
  created_at: string
  updated_at: string
}

export interface HerramientaGestionConContexto extends HerramientaGestion {
  autor_nombre: string | null
  // Contexto cuando el target es un plan
  plan_titulo: string | null
  plan_pregunta_numero: number | null
  plan_pilar_nombre: string | null
  // Contexto cuando el target es una actividad de reunión
  reunion_id: string | null
  reunion_tipo: string | null
  actividad_descripcion: string | null
  // Contexto cuando el target es un reporte de seguridad
  reporte_tipo: string | null
  reporte_descripcion: string | null
}

// ===== Ausentismo (Pampeana) =====
export type AusentismoMotivo =
  | "ausencia"
  | "licencia_medica"
  | "enfermedad_profesional"
  | "accidente"
  | "otras_licencias"
  | "licencia_gremial"
  | "suspension"

export const AUSENTISMO_MOTIVOS: AusentismoMotivo[] = [
  "ausencia",
  "licencia_medica",
  "enfermedad_profesional",
  "accidente",
  "otras_licencias",
  "licencia_gremial",
  "suspension",
]

export const AUSENTISMO_MOTIVO_LABELS: Record<AusentismoMotivo, string> = {
  ausencia: "Ausencia",
  licencia_medica: "Licencia Médica",
  enfermedad_profesional: "Enfermedad Profesional",
  accidente: "Accidente",
  otras_licencias: "Otras licencias",
  licencia_gremial: "Licencia Gremial",
  suspension: "Suspensión",
}

export const AUSENTISMO_MOTIVO_COLORS: Record<AusentismoMotivo, string> = {
  ausencia: "#64748B",
  licencia_medica: "#3B82F6",
  enfermedad_profesional: "#A855F7",
  accidente: "#EF4444",
  otras_licencias: "#F59E0B",
  licencia_gremial: "#10B981",
  suspension: "#0EA5E9",
}

export interface AusentismoEvento {
  id: string
  empleado_id: string
  fecha_inicio: string
  dias: number
  fecha_fin: string
  motivo: AusentismoMotivo
  comentario: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_size: number | null
  created_at: string
  created_by: string | null
  updated_at: string
  updated_by: string | null
}

export interface AusentismoEventoConEmpleado extends AusentismoEvento {
  empleado_nombre: string
  empleado_legajo: number
  empleado_sector: string | null
}

export interface AusentismoEmpleadoOpcion {
  id: string
  legajo: number
  nombre: string
  sector: string | null
}

export interface AusentismoResumenMotivo {
  motivo: AusentismoMotivo
  eventos: number
  dias_totales: number
}

export interface AusentismoResumenMes {
  year_month: string // YYYY-MM
  eventos_total: number
  dias_total: number
  por_motivo: AusentismoResumenMotivo[]
}

export interface AusentismoRepitenciaEmpleado {
  empleado_id: string
  empleado_nombre: string
  empleado_legajo: number
  empleado_sector: string | null
  eventos: number
  dias_totales: number
  promedio_dias: number
  ultimo_evento: string // ISO date
  motivo_predominante: AusentismoMotivo
}

export interface AusentismoLicenciasMedicasMesBucket {
  year_month: string // YYYY-MM
  eventos: number
  dias_totales: number
}

export interface AusentismoLicenciasMedicasReporte {
  total_eventos: number
  total_dias: number
  empleados_con_lm: number
  empleados_con_repitencia: number
  top_empleados: AusentismoRepitenciaEmpleado[]
  por_mes: AusentismoLicenciasMedicasMesBucket[]
}

// =============================================
// SLA (Acuerdos de Nivel de Servicio) — exigidos por el manual DPO
// =============================================
export type SlaPilar =
  | "planeamiento"
  | "almacen"
  | "entrega"
  | "flota"
  | "gestion"

// Estado guardado en DB. "vencido" NO es un valor persistido: se deriva en
// lectura cuando fecha_vencimiento < hoy (ver campo `vencido` de SlaConAutor).
export type SlaEstado = "pendiente" | "firmado" | "no_aplica"

export interface Sla {
  id: string
  codigo: string
  nombre: string
  pilar: SlaPilar
  parte_cliente: string | null
  parte_proveedor: string | null
  requisito_manual: string | null
  descripcion: string | null
  estado: SlaEstado
  fecha_firma: string | null
  fecha_vencimiento: string | null
  es_predefinido: boolean
  orden: number
  notas: string | null
  creado_por: string | null
  created_at: string
  updated_at: string
}

export interface SlaAdjunto {
  id: string
  sla_id: string
  storage_path: string
  nombre_original: string | null
  mime_type: string
  tamaño_bytes: number
  subido_por: string | null
  created_at: string
  /** URL pública del archivo en Storage (la arma el server al leer). */
  url: string
}

export interface SlaConAutor extends Sla {
  adjuntos: SlaAdjunto[]
  /** Derivado: fecha_vencimiento pasada y estado != no_aplica. */
  vencido: boolean
}

export const SLA_PILAR_LABELS: Record<SlaPilar, string> = {
  planeamiento: "Planeamiento",
  almacen: "Almacén",
  entrega: "Entrega",
  flota: "Flota",
  gestion: "Gestión",
}

export const SLA_PILAR_ORDEN: SlaPilar[] = [
  "planeamiento",
  "almacen",
  "entrega",
  "flota",
  "gestion",
]

export const SLA_ESTADO_LABELS: Record<SlaEstado, string> = {
  pendiente: "Pendiente",
  firmado: "Firmado",
  no_aplica: "No aplica",
}

// =====================================================
// Portal del Empleado · Buzón de Comunicaciones
// =====================================================
export type ComunicacionCategoria =
  | "rrhh"
  | "seguridad_higiene"
  | "operaciones"
  | "logistica"
  | "sistemas"
  | "capacitaciones"
  | "direccion_general"

export type ComunicacionPrioridad = "baja" | "media" | "alta"

export type ComunicacionEstado = "abierta" | "en_revision" | "gestionada" | "cerrada"

export interface Comunicacion {
  id: string
  numero: number
  titulo: string
  cuerpo: string
  categoria: ComunicacionCategoria
  prioridad: ComunicacionPrioridad
  estado: ComunicacionEstado
  asignado_a: string | null
  creado_por: string
  gestionado_at: string | null
  cerrado_at: string | null
  created_at: string
  updated_at: string
}

export interface ComunicacionAdjunto {
  id: string
  comunicacion_id: string
  storage_path: string
  nombre_original: string
  mime_type: string
  tamaño_bytes: number
  created_at: string
}

export interface ComunicacionAdjuntoConUrl extends ComunicacionAdjunto {
  url: string
}

/** Item de listado: autor, responsable asignado y nº de adjuntos. */
export interface ComunicacionConAutor extends Comunicacion {
  autor_nombre: string
  asignado_nombre: string | null
  adjuntos_count: number
}

export interface ComunicacionComentario {
  id: string
  comunicacion_id: string
  texto: string
  interno: boolean
  autor: string
  created_at: string
}

export interface ComunicacionComentarioConAutor extends ComunicacionComentario {
  autor_nombre: string
}

export interface ComunicacionHistorial {
  id: string
  comunicacion_id: string
  estado_anterior: ComunicacionEstado | null
  estado_nuevo: ComunicacionEstado
  changed_by: string | null
  changed_at: string
}

export interface ComunicacionDetalle extends ComunicacionConAutor {
  adjuntos: ComunicacionAdjuntoConUrl[]
  comentarios: ComunicacionComentarioConAutor[]
  historial: ComunicacionHistorial[]
}

export const COMUNICACION_CATEGORIA_LABELS: Record<ComunicacionCategoria, string> = {
  rrhh: "RRHH",
  seguridad_higiene: "Seguridad e Higiene",
  operaciones: "Operaciones",
  logistica: "Logística",
  sistemas: "Sistemas",
  capacitaciones: "Capacitaciones",
  direccion_general: "Dirección General",
}

export const COMUNICACION_CATEGORIA_COLORS: Record<ComunicacionCategoria, string> = {
  rrhh: "#8B5CF6",
  seguridad_higiene: "#EF4444",
  operaciones: "#3B82F6",
  logistica: "#F59E0B",
  sistemas: "#6366F1",
  capacitaciones: "#14B8A6",
  direccion_general: "#0EA5E9",
}

export const COMUNICACION_CATEGORIA_ORDEN: ComunicacionCategoria[] = [
  "rrhh",
  "seguridad_higiene",
  "operaciones",
  "logistica",
  "sistemas",
  "capacitaciones",
  "direccion_general",
]

export const COMUNICACION_PRIORIDAD_LABELS: Record<ComunicacionPrioridad, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
}

export const COMUNICACION_PRIORIDAD_COLORS: Record<ComunicacionPrioridad, string> = {
  baja: "#64748B",
  media: "#F59E0B",
  alta: "#EF4444",
}

export const COMUNICACION_ESTADO_LABELS: Record<ComunicacionEstado, string> = {
  abierta: "Abierta",
  en_revision: "En revisión",
  gestionada: "Gestionada",
  cerrada: "Cerrada",
}

export const COMUNICACION_ESTADO_COLORS: Record<ComunicacionEstado, string> = {
  abierta: "#EF4444",
  en_revision: "#F59E0B",
  gestionada: "#10B981",
  cerrada: "#6B7280",
}

export const COMUNICACION_ESTADO_ORDEN: ComunicacionEstado[] = [
  "abierta",
  "en_revision",
  "gestionada",
  "cerrada",
]

// =====================================================
// Portal del Empleado · Servicios Generales (mesa de ayuda)
// =====================================================
export type SgCategoria =
  | "edilicio"
  | "electricidad"
  | "iluminacion"
  | "aire_acondicionado"
  | "sanitarios"
  | "mobiliario"
  | "equipamiento"
  | "limpieza"
  | "seguridad_fisica"
  | "otros"

export type SgEstado =
  | "abierto"
  | "en_revision"
  | "asignado"
  | "en_proceso"
  | "resuelto"
  | "cerrado"

export interface SgTicket {
  id: string
  numero: number
  categoria: SgCategoria
  titulo: string
  descripcion: string
  sector: string | null
  estado: SgEstado
  asignado_a: string | null
  creado_por: string
  resuelto_at: string | null
  cerrado_at: string | null
  created_at: string
  updated_at: string
}

export interface SgTicketConAutor extends SgTicket {
  autor_nombre: string
  asignado_nombre: string | null
}

export interface SgTicketAdjunto {
  id: string
  ticket_id: string
  storage_path: string
  nombre_original: string
  mime_type: string
  tamaño_bytes: number
  es_evidencia: boolean
  created_at: string
}

export interface SgTicketAdjuntoConUrl extends SgTicketAdjunto {
  url: string
}

export interface SgTicketComentario {
  id: string
  ticket_id: string
  texto: string
  interno: boolean
  autor: string
  created_at: string
}

export interface SgTicketComentarioConAutor extends SgTicketComentario {
  autor_nombre: string
}

export interface SgTicketHistorial {
  id: string
  ticket_id: string
  estado_anterior: SgEstado | null
  estado_nuevo: SgEstado
  changed_by: string | null
  changed_at: string
}

export interface SgTicketDetalle extends SgTicketConAutor {
  adjuntos: SgTicketAdjuntoConUrl[]
  comentarios: SgTicketComentarioConAutor[]
  historial: SgTicketHistorial[]
}

export const SG_CATEGORIA_LABELS: Record<SgCategoria, string> = {
  edilicio: "Problemas edilicios",
  electricidad: "Electricidad",
  iluminacion: "Iluminación",
  aire_acondicionado: "Aire acondicionado",
  sanitarios: "Sanitarios",
  mobiliario: "Mobiliario",
  equipamiento: "Equipamiento",
  limpieza: "Limpieza",
  seguridad_fisica: "Seguridad física",
  otros: "Otros",
}

export const SG_CATEGORIA_ORDEN: SgCategoria[] = [
  "edilicio",
  "electricidad",
  "iluminacion",
  "aire_acondicionado",
  "sanitarios",
  "mobiliario",
  "equipamiento",
  "limpieza",
  "seguridad_fisica",
  "otros",
]

export const SG_ESTADO_LABELS: Record<SgEstado, string> = {
  abierto: "Abierto",
  en_revision: "En revisión",
  asignado: "Asignado",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
}

export const SG_ESTADO_COLORS: Record<SgEstado, string> = {
  abierto: "#EF4444",
  en_revision: "#F59E0B",
  asignado: "#3B82F6",
  en_proceso: "#6366F1",
  resuelto: "#10B981",
  cerrado: "#6B7280",
}

export const SG_ESTADO_ORDEN: SgEstado[] = [
  "abierto",
  "en_revision",
  "asignado",
  "en_proceso",
  "resuelto",
  "cerrado",
]

// ============================================
// Matriz de Habilidades (Matriz SKAP) — Pilar GENTE 4.4
// OJO: distinto de SkapMatriz/sop_certificaciones, que es la certificación
// de SOPs (vigente/vencida). Acá se mide habilidad vs estándar y el gap.
// ============================================

export type SkapRol =
  | "chofer"
  | "ayudante"
  | "pickero"
  | "autoelevadorista"
  | "mantenimiento"
  | "administrativo"

export type SkapCriticidad = "A" | "B" | "C"

/** Semáforo del gap = nivel - estándar (según el instructivo del Excel). */
export type SkapEstadoGap =
  | "critico" // gap <= -2
  | "brecha" // gap == -1
  | "cumple" // gap >= 0
  | "sin_evaluar" // todavía no se evaluó
  | "no_aplica" // NA

export interface SkapHabilidad {
  id: string
  rol: SkapRol
  bloque: string
  criticidad: SkapCriticidad
  habilidad: string
  estandar: number
  orden: number
  activo: boolean
}

export interface SkapPlanFormacion {
  id: string
  habilidad_id: string
  alcance: string | null
  hs_teoricas: number | null
  hs_practicas: number | null
  experto: string | null
  instructor: string | null
  tutor: string | null
  metodo: string | null
  criterio_evaluacion: string | null
  material: string | null
}

export interface SkapEvaluacion {
  id: string
  empleado_id: string
  habilidad_id: string
  fecha_evaluacion: string
  nivel: number | null
  estandar_individual: number | null
  observaciones: string | null
  evaluador_id: string | null
}

export type SkapEstadoAccion = "pendiente" | "programada" | "realizada" | "cerrada"

export interface SkapAccion {
  id: string
  empleado_id: string
  habilidad_id: string
  estado: SkapEstadoAccion
  fecha_programada: string | null
  fecha_realizada: string | null
  responsable: string | null
  nivel_origen: number | null
  observaciones: string | null
}

/** Una celda de la grilla: persona × habilidad. */
export interface SkapCelda {
  habilidad_id: string
  nivel: number | null
  estandar: number // el individual si existe, si no el general
  gap: number | null
  estado: SkapEstadoGap
  fecha_evaluacion: string | null
}

export interface SkapPersonaRow {
  empleado_id: string
  legajo: number
  nombre: string
  celdas: SkapCelda[]
  /** % de habilidades CRÍTICAS (A) que llegan al estándar. Es el KPI del 4.4. */
  pct_criticas: number | null
  pct_general: number | null
  gaps_criticos: number
}

export interface SkapMatrizRol {
  rol: SkapRol
  habilidades: SkapHabilidad[]
  personas: SkapPersonaRow[]
  kpis: {
    personas: number
    evaluadas: number
    pct_cobertura_criticas: number | null
    gaps_criticos: number
    gaps_brecha: number
    acciones_abiertas: number
  }
}

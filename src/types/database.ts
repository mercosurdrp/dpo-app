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
  archivos_dpo: DpoArchivo[]
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

export interface ReporteSeguridadDetalle extends ReporteSeguridadConAutor {
  adjuntos: (ReporteSeguridadAdjunto & { url: string })[]
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

export interface S5Auditoria {
  id: string
  tipo: S5Tipo
  periodo: string
  fecha: string
  auditor_id: string
  vehiculo_id: string | null
  chofer_nombre: string | null
  ayudante_1: string | null
  ayudante_2: string | null
  sector_numero: number | null
  estado: S5AuditoriaEstado
  nota_total: number | null
  notas_por_s: Record<S5Categoria, number> | null
  observaciones_generales: string | null
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

export interface S5AuditoriaItemConCatalogo extends S5AuditoriaItem {
  catalogo: S5ItemCatalogo
}

export interface S5AuditoriaConMeta extends S5Auditoria {
  auditor_nombre: string
  vehiculo_dominio: string | null
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

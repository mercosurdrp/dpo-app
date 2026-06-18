// Tipos del módulo Buenas Prácticas (punto 4.4 Gestión).
// Vive fuera de cualquier archivo "use server" para no romper el build de
// Turbopack (exportar type/const desde "use server" lo rompe).

export type BpArea =
  | "almacen"
  | "entrega"
  | "flota"
  | "gestion"
  | "seguridad"
  | "otro"

export type BpCategoria =
  | "seguridad"
  | "calidad"
  | "productividad"
  | "capacidad"
  | "otro"

export type BpOrigen = "portal" | "gestion"

export type BpEstado =
  | "nueva"
  | "en_revision"
  | "aprobada"
  | "rechazada"
  | "implementada"
  | "replicada"

export type BpAvanceTipo =
  | "comentario"
  | "cambio_estado"
  | "reconocimiento"
  | "implementacion"
  | "impacto"

export interface BpIdea {
  id: string
  titulo: string
  descripcion: string | null
  area: BpArea
  categoria: BpCategoria
  autor_nombre: string
  autor_area: string | null
  autor_profile_id: string | null
  origen: BpOrigen
  estado: BpEstado
  comentario_revision: string | null
  revisado_por: string | null
  fecha_revision: string | null
  reconocido: boolean
  reconocimiento: string | null
  kpi_nombre: string | null
  kpi_unidad: string | null
  kpi_linea_base: number | null
  kpi_objetivo: number | null
  kpi_logrado: number | null
  kpi_comentario: string | null
  replicable: boolean
  replica_areas: string | null
  replica_comentario: string | null
  elevada_zona: boolean
  fecha_elevacion: string | null
  elevacion_comentario: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BpAvance {
  id: string
  idea_id: string
  tipo: BpAvanceTipo
  descripcion: string | null
  estado_resultante: BpEstado | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

export type BpAccionEstado = "pendiente" | "en_curso" | "hecho"

export interface BpAccion {
  id: string
  idea_id: string
  que_hacer: string
  responsable: string | null
  fecha_limite: string | null
  estado: BpAccionEstado
  completado_at: string | null
  orden: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface BpIdeaConAvances extends BpIdea {
  avances: BpAvance[]
  acciones: BpAccion[]
}

export const BP_ACCION_ESTADO_LABEL: Record<BpAccionEstado, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecho: "Hecho",
}

/** Estado de cumplimiento de cada requisito R4.4.x del manual. */
export interface BpRequisito {
  codigo: string
  texto: string
  cumple: boolean
  detalle: string
}

/** Resumen de cumplimiento del punto 4.4 con el nivel estimado (0/1/3/5). */
export interface BpCumplimiento {
  requisitos: BpRequisito[]
  nivelEstimado: 0 | 1 | 3 | 5
  nivelTexto: string
}

export interface BpStats {
  total: number
  porEstado: Record<BpEstado, number>
  desdePortal: number
  implementadas: number
  conImpacto: number
  replicables: number
  elevadas: number
  ultimos12m: number
}

export interface BpDashboard {
  ideas: BpIdea[]
  stats: BpStats
  cumplimiento: BpCumplimiento
}

export const BP_AREA_LABEL: Record<BpArea, string> = {
  almacen: "Almacén",
  entrega: "Entrega",
  flota: "Flota",
  gestion: "Gestión",
  seguridad: "Seguridad",
  otro: "Otro",
}

export const BP_CATEGORIA_LABEL: Record<BpCategoria, string> = {
  seguridad: "Seguridad",
  calidad: "Calidad",
  productividad: "Productividad",
  capacidad: "Capacidad",
  otro: "Otro",
}

export const BP_ESTADO_LABEL: Record<BpEstado, string> = {
  nueva: "Nueva",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  implementada: "Implementada",
  replicada: "Replicada",
}

export const BP_AVANCE_TIPO_LABEL: Record<BpAvanceTipo, string> = {
  comentario: "Comentario",
  cambio_estado: "Cambio de estado",
  reconocimiento: "Reconocimiento",
  implementacion: "Implementación",
  impacto: "Impacto / KPI",
}

/** ID de la pregunta 4.4 (Buenas Prácticas · Act) del pilar Gestión en la DB. */
export const PREGUNTA_44_ID = "188e2345-be82-4ef5-aa05-95a3366c83d7"

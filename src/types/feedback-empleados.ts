export type FeedbackCategoria = "seguridad" | "cliente" | "vehiculo" | "proceso" | "otro"
export type FeedbackCriticidad = "baja" | "media" | "alta"
export type FeedbackEstado = "nuevo" | "tratado" | "con_accion" | "cerrado"

export const CATEGORIA_LABEL: Record<FeedbackCategoria, string> = {
  seguridad: "Seguridad",
  cliente: "Cliente",
  vehiculo: "Vehículo",
  proceso: "Proceso",
  otro: "Otro",
}

export const CRITICIDAD_LABEL: Record<FeedbackCriticidad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}

export const ESTADO_LABEL: Record<FeedbackEstado, string> = {
  nuevo: "Pendiente de tratar",
  tratado: "Tratado en la matinal",
  con_accion: "Con acción abierta",
  cerrado: "Cerrado",
}

export interface FeedbackAdjunto {
  id: string
  feedback_id: string
  storage_path: string
  nombre_original: string | null
  mime_type: string
  tamaño_bytes: number | null
  created_at: string
  /** Resuelta con getPublicUrl al leer. */
  url?: string
}

export interface FeedbackEmpleado {
  id: string
  numero: number
  fecha: string
  categoria: FeedbackCategoria
  criticidad: FeedbackCriticidad
  titulo: string
  descripcion: string
  creado_por: string
  empleado_id: string | null
  empleado_nombre: string | null
  sector: string | null
  reunion_id: string | null
  actividad_id: string | null
  estado: FeedbackEstado
  respuesta: string | null
  tratado_at: string | null
  cerrado_at: string | null
  created_at: string
  updated_at: string
  adjuntos?: FeedbackAdjunto[]
}

export interface FeedbackInput {
  fecha: string
  categoria: FeedbackCategoria
  criticidad: FeedbackCriticidad
  titulo: string
  descripcion: string
}

/** Foto ya subida al bucket desde el cliente (igual que roturas). */
export interface UploadedFeedbackFoto {
  storage_path: string
  nombre_original: string
  mime_type: string
  tamaño_bytes: number
}

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

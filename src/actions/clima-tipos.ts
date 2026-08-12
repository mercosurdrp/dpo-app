/**
 * Tipos del módulo Clima.
 *
 * Viven fuera de los archivos `"use server"`: esos solo pueden exportar
 * funciones async (un `export type` o `export const` rompe el build de
 * Turbopack, y `tsc --noEmit` no lo detecta).
 */
import type { ArchivoAvance } from "@/lib/adjuntos-avance"

// ---------------------------------------------------------------- resultados

export interface ClimaOla {
  id: string
  codigo: string
  anio: number
  semestre: number
  respondentes: number | null
  archivo_origen: string | null
  notas: string | null
  importada_at: string
}

export type EstadoComparacion =
  | "mejora"
  | "estable"
  | "retroceso"
  | "nueva"
  | "discontinuada"

export interface FilaComparada {
  /** Texto completo tal como lo publica la planilla (ola vigente). */
  texto: string
  /** Etiqueta corta para tablas. */
  etiqueta: string
  dimension: string
  dimensionNombre: string
  valor: number | null
  anterior: number | null
  delta: number | null
  estado: EstadoComparacion
}

export interface CorteResumen {
  corte_tipo: string
  corte: string
  engagement: number | null
  engagementAnterior: number | null
  engagementDelta: number | null
  dimensiones: FilaComparada[]
  preguntas: FilaComparada[]
}

export interface ClimaComentario {
  corte_tipo: string
  corte: string
  pregunta: string
  respuesta: string
}

export interface ClimaAnalisis {
  olas: ClimaOla[]
  ola: ClimaOla
  olaAnterior: ClimaOla | null
  /** Dimensiones del total de la empresa. */
  dimensiones: FilaComparada[]
  /** Las preguntas del total de la empresa, de menor a mayor puntaje. */
  preguntas: FilaComparada[]
  cortes: CorteResumen[]
  comentarios: ClimaComentario[]
  resumen: {
    engagement: number | null
    engagementAnterior: number | null
    engagementDelta: number | null
    suben: number
    bajan: number
    estables: number
    comparables: number
    /** Preguntas con el puntaje más bajo de la ola (fijan el techo). */
    masBajas: FilaComparada[]
    /** Las que más retroceden contra la ola anterior. */
    masCaen: FilaComparada[]
    /** Las que más avanzan. */
    masSuben: FilaComparada[]
  }
}

/** Lo que devuelve la importación de una ola, para mostrarlo en pantalla. */
export interface ClimaImportResumen {
  ola_id: string
  codigo: string
  razon_social: string
  /** true = la ola ya existía y se reemplazaron sus datos. */
  reemplazada: boolean
  resultados: number
  comentarios: number
  jefes: string[]
  cortes: Record<string, number>
  faltantes: string[]
}

// -------------------------------------------------------------------- planes

export type EstadoClimaPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadClimaPlan = "alta" | "media" | "baja"

export const ESTADOS_CLIMA_PLAN: EstadoClimaPlan[] = [
  "pendiente",
  "en_progreso",
  "completado",
]
export const PRIORIDADES_CLIMA_PLAN: PrioridadClimaPlan[] = [
  "alta",
  "media",
  "baja",
]

export const ESTADO_CLIMA_LABEL: Record<EstadoClimaPlan, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completado: "Completado",
}

export const PRIORIDAD_CLIMA_LABEL: Record<PrioridadClimaPlan, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
}

/**
 * Un plan de acción de clima, con las columnas del formato clásico de RRHH:
 * Prioridad · Foco · Eje/Driver · Hallazgo · Acción · Responsable · Plazo ·
 * Indicador de éxito · Estado.
 */
export interface ClimaPlan {
  id: string
  ola_id: string | null
  ola_codigo: string | null
  prioridad: PrioridadClimaPlan
  foco: string | null
  eje: string | null
  dimension: string | null
  pregunta: string | null
  hallazgo: string | null
  accion: string
  responsable_id: string | null
  responsable_nombre: string | null
  responsable_texto: string | null
  plazo: string | null
  fecha_objetivo: string | null
  indicador_exito: string | null
  estado: EstadoClimaPlan
  created_by: string | null
  created_by_nombre: string | null
  created_at: string
  updated_at: string
  avances_count: number
}

export interface ClimaPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  archivos: ArchivoAvance[]
  estado_resultante: EstadoClimaPlan | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

/** Ejes/drivers sugeridos, tomados del plan de acción H2 2025 de RRHH. */
export const EJES_SUGERIDOS = [
  "Infraestructura y servicios generales",
  "Comunicación y coordinación entre áreas",
  "Organización operativa y procesos",
  "Reconocimiento e incentivos",
  "Liderazgo y feedback",
  "Desarrollo y carrera",
  "Compensación y beneficios",
  "Jornada y horarios",
  "Sostener fortalezas",
]

/** Plazos como los escribe RRHH en la planilla. */
export const PLAZOS_SUGERIDOS = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Continuo",
  "Inmediato",
]

// Tipos del juego "Trivia MERCOSUR" (desafío de conocimiento diario).
// Ver migración 157_trivia_juego.sql y src/actions/trivia.ts.

export interface JuegoConfig {
  id: number
  tiempo_limite_seg: number
  puntos_acierto: number
  bonus_velocidad_max: number
  preguntas_por_dia: number
  capacitaciones_excluidas: string[]
  dias_sin_repetir: number
  activo: boolean
  updated_at: string
}

/** Pregunta servida al cliente. NUNCA incluye la respuesta correcta. */
export interface PreguntaServida {
  id: string
  orden: number
  total: number
  texto: string
  opciones: string[]
  /** Sello del servidor de cuándo se sirvió la pregunta (anti-trampa). */
  servedAtISO: string
  /** "Ahora" según el servidor, para arrancar el cronómetro en el cliente. */
  serverNowISO: string
  tiempoLimiteSeg: number
}

export interface ResumenDia {
  puntos: number
  correctas: number
  total: number
  tiempoTotalMs: number
}

export interface RevisionItem {
  texto: string
  opciones: string[]
  respuestaCorrecta: number
  respuestaElegida: number | null
  esCorrecta: boolean
  puntos: number
}

/** Estado del desafío de hoy para el empleado logueado. */
export type EstadoTrivia =
  | { estado: "error"; mensaje: string }
  | { estado: "sin_preguntas" }
  | {
      estado: "jugando"
      respondidas: number
      total: number
      puntosAcum: number
    }
  | {
      estado: "completado"
      resumen: ResumenDia
      posicionMes: number | null
      revision: RevisionItem[]
    }

/** Resultado de responder una pregunta. */
export interface RespuestaResultado {
  ok: true
  correcta: boolean
  respuestaCorrecta: number
  tuOpcion: number | null
  puntos: number
  esUltima: boolean
  // Presentes solo cuando fue la última pregunta del día:
  resumen?: ResumenDia
  posicionMes?: number | null
  revision?: RevisionItem[]
}

/** Lo que devuelve servirSiguiente(): una pregunta, el fin, o un error. */
export type SiguienteResultado =
  | { fin: true }
  | { error: string }
  | ({ ok: true } & PreguntaServida)

export interface RankingFila {
  empleadoId: string
  nombre: string
  sector: string | null
  puntos: number
  correctas: number
  dias: number
  posicion: number
  esYo: boolean
}

/**
 * Vocabulario de la Encuesta de Clima: nombres oficiales de las dimensiones,
 * etiquetas cortas de las preguntas y el mapa de las que cambiaron de redacción
 * entre olas.
 *
 * Las dimensiones van SIEMPRE con su nombre oficial (Índice de Engagement ·
 * Liderazgo · Necesidades Básicas · Crecimiento y Reconocimiento · Pertenencia
 * y Trabajo en Equipo). La explicación en criollo se muestra como texto aparte,
 * nunca reemplazando el nombre.
 */

/** La dimensión "A - ÍNDICE DE ENGAGEMENT" como viene en la planilla. */
export const DIM_ENGAGEMENT = "A - ÍNDICE DE ENGAGEMENT"

/** Orden de presentación: el índice primero, después las cuatro dimensiones. */
export const ORDEN_DIMENSIONES = [
  DIM_ENGAGEMENT,
  "Liderazgo",
  "Necesidades Básicas",
  "Crecimiento y Reconocimiento",
  "Pertenencia y Trabajo en Equipo",
  "SERVICIOS GENERALES",
]

export const DIMENSION_NOMBRE: Record<string, string> = {
  [DIM_ENGAGEMENT]: "Índice de Engagement",
  Liderazgo: "Liderazgo",
  "Necesidades Básicas": "Necesidades Básicas",
  "Crecimiento y Reconocimiento": "Crecimiento y Reconocimiento",
  "Pertenencia y Trabajo en Equipo": "Pertenencia y Trabajo en Equipo",
  "SERVICIOS GENERALES": "Servicios Generales",
}

/** Qué mide cada dimensión, en criollo. Acompaña al nombre, no lo reemplaza. */
export const DIMENSION_EN_CRIOLLO: Record<string, string> = {
  [DIM_ENGAGEMENT]:
    "Qué tan comprometida está la gente: orgullo, recomendación, ganas de quedarse y satisfacción general.",
  Liderazgo:
    "Mi jefe directo: si me dice qué espera de mí, si me da feedback, si trata bien al equipo.",
  "Necesidades Básicas":
    "Lo que necesito para trabajar: herramientas, carga de trabajo sostenible, procesos sin vueltas.",
  "Crecimiento y Reconocimiento":
    "Si crezco y si se nota: oportunidades de aprender, reconocimiento y claridad de la compensación.",
  "Pertenencia y Trabajo en Equipo":
    "El clima entre compañeros: cooperación, poder opinar distinto y trato justo.",
  "SERVICIOS GENERALES":
    "Estado de las instalaciones: baños, oficinas, salas y zona de refrigerios.",
}

/**
 * Dimensión discontinuada en H1 2026 (era la más baja del grupo). Se declara
 * como no comparable en vez de completarla con un valor inventado.
 */
export const DIMENSION_DISCONTINUADA = "SERVICIOS GENERALES"

/**
 * Preguntas que cambiaron de redacción entre olas: la clave es la redacción
 * vieja y el valor la nueva. El cruce entre olas pasa por acá, nunca por texto
 * exacto.
 */
export const PREGUNTAS_RENOMBRADAS: Record<string, string> = {
  "Me siento orgulloso/a de trabajar en la distribuidor.":
    "Me siento orgulloso/a de trabajar en el distribuidor.",
  "Estoy satisfecho/a con la distribuidor como lugar para trabajar.":
    "Estoy satisfecho/a con el distribuidor como lugar para trabajar.",
  "La gerencia de mi área transmite de forma clara el propósito de nuestro distribuidor y los objetivos a largo plazo.":
    "La gerencia de mi distribuidor transmite de forma clara el propósito y los objetivos a largo plazo.",
  "Mi líder directo vive día a día los Principios del distribuidor.":
    "Mi líder directo vive día a día nuestros Principios.",
  "En general,  mi carga laboral es sostenible":
    "En general, creo que mi carga laboral es sostenible.",
  "En el distribuidor existe una comunicación abierta y honesta, con un diálogo bidireccional.":
    "En el distribuidor existe una comunicación abierta y honesta, con un diálogo entre ambas partes.",
  "Todos los empleados, independientemente de sus diferencias, son tratados de manera justa.":
    "Todos los colaboradores, independientemente de sus diferencias, son tratados de manera justa.",
}

/** Etiqueta corta para tablas y gráficos. */
export const PREGUNTA_CORTA: Record<string, string> = {
  "Me siento orgulloso/a de trabajar en el distribuidor.":
    "Orgullo de pertenencia",
  "Recomendaría al distribuidor como un excelente lugar para trabajar.":
    "Recomendaría la empresa (eNPS)",
  "Tengo la intención de permanecer en el distribuidor por lo menos durante los próximos 12 meses.":
    "Intención de permanencia 12m",
  "Estoy satisfecho/a con el distribuidor como lugar para trabajar.":
    "Satisfacción general",
  "En mi equipo tomamos los errores como una oportunidad de aprender y mejorar.":
    "Errores como aprendizaje",
  "Entiendo cómo se compone mi compensación total.":
    "Claridad de la compensación",
  "Me siento animado a crear mejores formas de hacer las cosas.":
    "Iniciativa para mejorar",
  "Me siento reconocido/a por mi trabajo.": "Reconocimiento",
  "Mi líder directo me proporciona feedback de forma regular que me ayuda a mejorar mi desempeño.":
    "Feedback del líder",
  "Mi líder directo me proporciona feedback de forma regular que me ayuda a desarrollarme.":
    "Feedback del líder",
  "Tengo suficientes oportunidades para aprender nuevas habilidades y crecer.":
    "Oportunidades de desarrollo",
  "Tengo suficientes oportunidades para aprender nuevas habilidades y desarrollar mi carrera.":
    "Oportunidades de desarrollo",
  "La gerencia de mi distribuidor transmite de forma clara el propósito y los objetivos a largo plazo.":
    "Propósito y rumbo (gerencia)",
  "Mi líder directo me comunica claramente que se espera de mí.":
    "Claridad de expectativas",
  "Mi líder directo me trata a todos los miembros del equipo con respeto.":
    "Respeto del líder",
  "Mi líder directo trata a todos los miembros del equipo con respeto.":
    "Respeto del líder",
  "Mi líder directo vive día a día nuestros Principios.":
    "Líder vive los Principios",
  "Recomendaría a mi líder directo a otras personas.": "Recomendaría a mi líder",
  "Cuento con las herramientas que necesito para realizar bien mi trabajo.":
    "Herramientas de trabajo",
  "El distribuidor  hace un buen trabajo para minimizar o eliminar procesos burocráticos innecesarios.":
    "Burocracia innecesaria",
  "En general, creo que mi carga laboral es sostenible.":
    "Carga laboral sostenible",
  "Me siento empoderado/a para tomar las decisiones necesarias para realizar mi trabajo correctamente.":
    "Autonomía para decidir",
  "Me siento empoderado/a para tomar las decisiones necesarias para realizar bien mi trabajo.":
    "Autonomía para decidir",
  "Puedo informar sobre prácticas no éticas sin miedo a represalias.":
    "Hablar sin miedo (ética)",
  "En el distribuidor existe una comunicación abierta y honesta, con un diálogo entre ambas partes.":
    "Comunicación bidireccional",
  "Hay buen trabajo en equipo y cooperación entre las personas con las que trabajo.":
    "Trabajo en equipo",
  "Me siento cómodo/a expresando opiniones diferentes a las de mi equipo.":
    "Opinar distinto sin costo",
  "Puedo ser auténtico/a en mi espacio de trabajo.": "Autenticidad",
  "Todos los colaboradores, independientemente de sus diferencias, son tratados de manera justa.":
    "Trato justo",
  "¿Cómo calificarías el estado actual de la ZONA DE REFRIGERIOS?":
    "Zona de refrigerios",
  "¿Cómo calificarías el estado actual de los BAÑOS?": "Baños",
  "¿Cómo calificarías el estado actual de las OFICINAS?": "Oficinas",
  "¿Cómo calificarías el estado actual de las SALAS DE REUNIONES?":
    "Salas de reuniones",
}

/** Normaliza un texto de pregunta para comparar entre olas. */
export function normalizarPregunta(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
}

export function dimensionNombre(dim: string): string {
  return DIMENSION_NOMBRE[dim] ?? dim
}

export function preguntaCorta(pregunta: string): string {
  const p = pregunta.trim()
  return (
    PREGUNTA_CORTA[p] ??
    PREGUNTA_CORTA[PREGUNTAS_RENOMBRADAS[p] ?? ""] ??
    p
  )
}

/**
 * Semáforo del clima, el mismo que usa RRHH en la planilla:
 * verde ≥90 · amarillo 80-89 · naranja 70-79 · rojo <70.
 */
export type ClimaSemaforo = "verde" | "amarillo" | "naranja" | "rojo"

export function semaforo(valor: number | null): ClimaSemaforo | null {
  if (valor == null) return null
  if (valor >= 90) return "verde"
  if (valor >= 80) return "amarillo"
  if (valor >= 70) return "naranja"
  return "rojo"
}

export const SEMAFORO_ETIQUETA: Record<ClimaSemaforo, string> = {
  verde: "Excelente",
  amarillo: "Bueno",
  naranja: "A trabajar",
  rojo: "Crítico",
}

/**
 * Variación mínima para hablar de mejora o retroceso. Debajo de 3 puntos, con
 * bases de 7 a 40 personas, el movimiento es una sola respuesta.
 */
export const UMBRAL_VARIACION = 3

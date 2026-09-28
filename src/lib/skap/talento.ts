import type { SkapRol } from "@/types/database"

// Tipos y reglas del tablero de Talento de la Matriz SKAP (padrinos,
// sucesores, debilidades). Vive fuera del action porque un archivo
// "use server" sólo puede exportar funciones async.

/**
 * Puesto siguiente de cada rol, para medir sucesión. La preparación de un
 * candidato se mide con la vara del puesto DESTINO: sus críticas y su estándar.
 */
export const SUCESION: Partial<Record<SkapRol, SkapRol>> = {
  temporal: "ayudante",
  ayudante: "chofer",
  pickero: "autoelevadorista",
}

/**
 * Habilidades que son la misma con otro nombre entre la matriz del pickero y
 * la del autoelevadorista (nombre normalizado destino → origen).
 */
export const EQUIVALENCIAS: Record<string, string> = {
  "conduccion de autoelevadores simple": "conduccion de autoelevadores",
  "conduccion de zorra electrica": "conduccion de zorra",
  "conocimientos generales del programa dpo": "conocimientos generales en el programa dpo",
  "correcto uso de epps": "conocimiento de los epp que requiere el puesto",
}

/**
 * Padrino = de los mejores de su rol: índice general en estándar o arriba y
 * casi todas las críticas cumplidas. No se exige el 100 %: en Entrega TODOS
 * tienen la misma brecha en «Conocimientos generales de la operación» y con
 * esa vara no quedaba ningún padrino.
 */
export const PADRINO = { indiceMin: 1, criticasMin: 90, porRol: 3 }

export function normalizarHabilidad(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export interface TalentoGap {
  habilidad: string
  criticidad: string
  nivel: number
  estandar: number
  /** Alguien (de cualquier rol) que domina esa habilidad y puede enseñarla. */
  padrino: { nombre: string; rol: SkapRol; nivel: number } | null
}

export interface TalentoPersona {
  empleado_id: string
  legajo: number
  nombre: string
  rol: SkapRol
  /** Suma de notas / suma de estándares (misma cuenta que el Excel). 1 = justo en estándar. */
  indice: number | null
  pct_criticas: number | null
  /** Habilidades con nivel 4 = «puede instruir a otros». */
  instruye: string[]
  gaps: TalentoGap[]
  gaps_criticos: number
}

export interface TalentoSucesor {
  empleado_id: string
  nombre: string
  legajo: number
  rol: SkapRol
  destino: SkapRol
  /** % de las críticas del puesto destino (con dato) que ya cumple. */
  preparacion: number | null
  cubiertas: number
  medibles: number
  faltan: string[]
  /** Críticas del destino que no existen en su matriz: hay que formarlas sí o sí. */
  a_formar: string[]
  indice_propio: number | null
}

export interface TalentoHabilidadDebil {
  rol: SkapRol
  habilidad: string
  criticidad: string
  con_gap: number
  evaluadas: number
}

export interface TalentoData {
  personas: TalentoPersona[]
  padrinos: TalentoPersona[]
  sucesores: TalentoSucesor[]
  debiles: TalentoPersona[]
  habilidadesDebiles: TalentoHabilidadDebil[]
}

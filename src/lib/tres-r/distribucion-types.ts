/**
 * Tipos del ranking 3R de Distribución (choferes y ayudantes juntos). Viven
 * fuera del archivo "use server" porque los usan componentes cliente.
 */
import type { S5AyudantePremio } from "@/types/database"

export interface TresRDistConfig {
  peso_rechazo: number
  peso_rmd: number
  peso_reportes: number
  peso_presentismo: number
  peso_5s: number
  peso_tml: number
  /** % de rechazo imputable (bultos) que deja el componente en 0 pts. */
  tope_rechazo: number
  /** Estrellas que valen 0 pts (piso) y 100 pts (techo). */
  rmd_piso: number
  rmd_techo: number
  /** Reportes en el bimestre que valen 100 pts. */
  tope_reportes: number
  /** Reportes mínimos para poder entrar al podio. */
  min_reportes: number
  tipos_reporte: string[]
  /** Días de licencia en el bimestre que dejan presentismo en 0 pts. */
  tope_dias_licencia: number
  /** Motivos de ausentismo que dejan fuera del podio. */
  motivos_descalifican: string[]
  /** TML: hasta la meta vale 100, en el tope vale 0. */
  tml_meta: number
  tml_tope: number
  /** % de los días hábiles del período que hay que haber salido. */
  min_pct_dias: number
  meses_ventana: number
}

export const TRES_R_DIST_DEFAULT: TresRDistConfig = {
  peso_rechazo: 30,
  peso_rmd: 25,
  peso_reportes: 15,
  peso_presentismo: 15,
  peso_5s: 10,
  peso_tml: 5,
  tope_rechazo: 3,
  rmd_piso: 4.8,
  rmd_techo: 5,
  tope_reportes: 3,
  min_reportes: 1,
  tipos_reporte: ["acto_inseguro", "acto_seguro", "ruta_riesgo"],
  tope_dias_licencia: 10,
  motivos_descalifican: ["ausencia", "suspension"],
  tml_meta: 25,
  tml_tope: 45,
  min_pct_dias: 50,
  meses_ventana: 2,
}

export const TIPOS_REPORTE_LABEL: Record<string, string> = {
  acto_inseguro: "Acto/condición insegura",
  acto_seguro: "Acto seguro",
  ruta_riesgo: "Ruta de riesgo",
  incidente: "Incidente",
  accidente: "Accidente",
}

export const MOTIVOS_AUSENTISMO_LABEL: Record<string, string> = {
  ausencia: "Ausencia",
  suspension: "Suspensión",
  licencia_medica: "Licencia médica",
  enfermedad_profesional: "Enfermedad profesional",
  accidente: "Accidente",
  otras_licencias: "Otras licencias",
  licencia_gremial: "Licencia gremial",
}

export type ComponenteTresR = "rechazo" | "rmd" | "reportes" | "presentismo" | "s5" | "tml"

export interface TresRDistRow {
  empleado_id: string
  legajo: number | null
  nombre: string
  rol: "chofer" | "ayudante"
  cd: string | null
  dias_con_ruta: number
  bultos: number
  /** % de rechazo imputable en bultos de sus camión-días. */
  rechazo_pct: number | null
  rechazo_score: number | null
  rmd: number | null
  rmd_n: number
  rmd_score: number | null
  reportes_cant: number
  reportes_score: number
  dias_licencia: number
  presentismo_score: number
  nota_5s: number | null
  s5_n: number
  tml: number | null
  tml_score: number | null
  raspones: number
  raspones_nota: string | null
  /** Aporte de cada componente al score (suman el score). */
  aportes: Partial<Record<ComponenteTresR, number>>
  score: number
  posicion_sugerida: number | null
  elegible: boolean
  /** Por qué no entra al podio (raspón, ausencia, sin reporte, pocos días). */
  motivos: string[]
  /** Detalle del ausentismo del período (sólo gestión). */
  ausentismo_detalle: string | null
}

export interface RankingDistribucionData {
  periodo_desde: string
  periodo_hasta: string
  meses: string[]
  /** Días hábiles (lun–sáb) transcurridos del período y mínimo exigido. */
  dias_habiles: number
  min_dias: number
  ranking: TresRDistRow[]
  premios: S5AyudantePremio[]
  foto: string | null
  config: TresRDistConfig
  /** La migración de las tablas 3R ya corrió (si no, rige el default). */
  tablas_ok: boolean
}

// ── Vista del empleado (portal) ──
export interface MiRanking3RDistFila {
  posicion: number
  nombre: string
  puntos: number
  soy_yo: boolean
}

export interface MiRanking3RDist {
  periodo_desde: string
  meses: string[]
  dias_restantes: number
  dias_habiles: number
  min_dias: number
  /** Peso de cada componente en % sobre 100. */
  pesos: Record<ComponenteTresR, number>
  config: TresRDistConfig
  tabla: MiRanking3RDistFila[]
  mio: (TresRDistRow & { posicion: number; reportes_faltan: number }) | null
  nombre: string
}

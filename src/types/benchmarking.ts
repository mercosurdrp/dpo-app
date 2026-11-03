// Tipos del módulo Benchmarking (tablas benchmarking_* de la migración
// 20261103120000). Punto DPO Entrega 5.2 BENCHMARK.

export type BenchTipo = "interno" | "externo"
export type BenchModalidad = "visita" | "virtual" | "intercambio_datos" | "analisis_interno"
export type AplicacionEstado = "propuesta" | "en_curso" | "aplicada" | "descartada"
export type MejorSi = "mayor" | "menor"

export const BENCH_MODALIDADES: { value: BenchModalidad; label: string }[] = [
  { value: "visita", label: "Visita presencial" },
  { value: "virtual", label: "Reunión virtual" },
  { value: "intercambio_datos", label: "Intercambio de datos" },
  { value: "analisis_interno", label: "Análisis interno (clusters)" },
]

export const APLICACION_ESTADOS: { value: AplicacionEstado; label: string }[] = [
  { value: "propuesta", label: "Propuesta" },
  { value: "en_curso", label: "En curso" },
  { value: "aplicada", label: "Aplicada" },
  { value: "descartada", label: "Descartada" },
]

/** KPIs que el punto 5.2 sugiere mirar; se pueden agregar otros a mano. */
export const INDICADORES_SUGERIDOS = [
  "TLP",
  "In Full",
  "On Time",
  "RMD",
  "% Rechazo",
  "NPS de entrega",
  "Costo $/HL",
  "Tiempo por PDV",
  "Km por ruta",
  "Adherencia a la secuencia",
  "Ocupación de bodega",
  "Productividad de picking",
]

export interface BenchEvidencia {
  id: string
  bench_id: string
  path: string
  nombre: string
  mime: string | null
  bytes: number | null
  descripcion: string | null
  created_by: string | null
  created_at: string
  /** URL firmada (10 min) para mostrar miniaturas; la arma el server. */
  url: string | null
  es_imagen: boolean
}

export interface AplicacionValor {
  mes: string // "YYYY-MM"
  valor: number | null
  nota: string | null
}

export interface BenchAplicacion {
  id: string
  bench_id: string
  titulo: string
  descripcion: string | null
  proceso: string | null
  responsable: string | null
  estado: AplicacionEstado
  fecha_aplicacion: string | null
  indicador_id: string | null
  indicador_nombre: string | null
  unidad: string | null
  mejor_si: MejorSi
  meta: number | null
  resultado: string | null
  created_at: string
  updated_at: string
  /** Serie mensual: la del Cuadro mensual si indicador_id, si no la manual. */
  serie: AplicacionValor[]
  fuente: "cuadro" | "manual"
}

export interface Bench {
  id: string
  tipo: BenchTipo
  titulo: string
  fecha: string
  contraparte: string | null
  modalidad: BenchModalidad
  lugar: string | null
  participantes: string | null
  objetivo: string | null
  temas: string | null
  conclusiones: string | null
  indicadores: string[]
  created_by: string | null
  created_at: string
  updated_at: string
  creador_nombre: string | null
  evidencias: BenchEvidencia[]
  aplicaciones: BenchAplicacion[]
}

/** Opción del selector de indicador del Cuadro mensual. */
export interface IndicadorCuadroOpcion {
  id: string
  pilar: string
  nombre: string
  unidad: string
  mejor_si: "mayor" | "menor" | "sin"
  meta: number | null
}

/**
 * Comparativo del acumulado del año contra el año anterior, al mismo día.
 *
 * El cálculo vive en la base (`rmd_ytd_comparativo()` / `nps_ytd_comparativo()`,
 * ver APLICAR_EN_PAMPEANA_YTD_COMPARATIVO.sql): son ~17.000 puntuaciones por
 * año y traerlas para promediar en la app es exactamente lo que la hacía lenta.
 * Acá quedan los tipos y la forma de leer una diferencia.
 */

export interface RmdYtdFila {
  anio: number
  puntuadas: number
  /** Promedio 1-5. null si el año no tiene datos cargados. */
  rmd: number | null
  detractores: number
  promotores: number
  /** Entregas encuestadas en el período (por fecha de entrega). */
  enviadas: number
}

export interface NpsYtdFila {
  anio: number
  encuestas: number
  promotores: number
  pasivos: number
  detractores: number
  /** -100 a 100. null si el año no tiene encuestas cargadas. */
  nps: number | null
}

export interface ComparativoYtd<T> {
  /** Año en curso. */
  actual: T
  /** Mismo período del año anterior. `sinDatos` cuando todavía no se cargó. */
  anterior: T
  sinDatos: boolean
  /** Día hasta el que se acumula, ISO (yyyy-mm-dd), en hora de Argentina. */
  hasta: string
}

/**
 * Cómo se lee una diferencia. Casi todo "más es mejor" (RMD, NPS, promotores),
 * pero los detractores son al revés: por eso cada métrica declara su sentido
 * en vez de que el componente lo adivine por el nombre.
 */
export type Sentido = "mas-es-mejor" | "menos-es-mejor" | "neutro"

export interface MetricaYtd {
  etiqueta: string
  /** Valor del año en curso. null = sin dato. */
  actual: number | null
  /** Valor del mismo período del año anterior. null = sin dato. */
  anterior: number | null
  sentido: Sentido
  /** Cómo mostrarlo: 4,99 · 84,2 % · 17.274 */
  formato: "decimal" | "porcentaje" | "entero"
  /** Aclaración al pie de la tarjeta. */
  nota?: string
}

const FMT_ENTERO = new Intl.NumberFormat("es-AR")
const FMT_DECIMAL = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const FMT_PCT = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatearYtd(valor: number | null, formato: MetricaYtd["formato"]): string {
  if (valor == null) return "—"
  if (formato === "entero") return FMT_ENTERO.format(valor)
  if (formato === "porcentaje") return `${FMT_PCT.format(valor)} %`
  return FMT_DECIMAL.format(valor)
}

export interface Diferencia {
  /** actual - anterior. null cuando falta alguno de los dos. */
  absoluta: number | null
  /** Variación porcentual sobre el año anterior. null si el anterior es 0. */
  relativa: number | null
  /** Si el cambio es bueno, malo o ninguno de los dos. */
  signo: "mejor" | "peor" | "igual" | "sin-dato"
}

export function diferencia(m: MetricaYtd): Diferencia {
  if (m.actual == null || m.anterior == null) {
    return { absoluta: null, relativa: null, signo: "sin-dato" }
  }
  const absoluta = m.actual - m.anterior
  const relativa = m.anterior !== 0 ? (absoluta / Math.abs(m.anterior)) * 100 : null

  let signo: Diferencia["signo"] = "igual"
  if (absoluta !== 0 && m.sentido !== "neutro") {
    const mejora = m.sentido === "mas-es-mejor" ? absoluta > 0 : absoluta < 0
    signo = mejora ? "mejor" : "peor"
  }
  return { absoluta, relativa, signo }
}

/** "+0,12" / "-3,4 %" — el signo siempre visible, que es lo que se busca acá. */
export function formatearDiferencia(
  d: Diferencia,
  formato: MetricaYtd["formato"],
): string {
  if (d.absoluta == null) return "—"
  const signo = d.absoluta > 0 ? "+" : d.absoluta < 0 ? "−" : ""
  return `${signo}${formatearYtd(Math.abs(d.absoluta), formato)}`
}

/** Porcentaje de un conteo sobre un total, para las métricas derivadas. */
export function pct(parte: number, total: number): number | null {
  if (!total) return null
  return (parte / total) * 100
}

/** Las 4 métricas de RMD que se comparan, ya derivadas de las filas crudas. */
export function metricasRmd(c: ComparativoYtd<RmdYtdFila>): MetricaYtd[] {
  const { actual: a, anterior: b, sinDatos } = c
  const sin = <T,>(v: T) => (sinDatos ? null : v)
  return [
    {
      etiqueta: "RMD promedio",
      actual: a.rmd,
      anterior: sin(b.rmd),
      sentido: "mas-es-mejor",
      formato: "decimal",
      nota: "puntuación 1 a 5 de cada entrega",
    },
    {
      etiqueta: "Entregas puntuadas",
      actual: a.puntuadas,
      anterior: sin(b.puntuadas),
      sentido: "mas-es-mejor",
      formato: "entero",
    },
    {
      etiqueta: "Detractores",
      actual: pct(a.detractores, a.puntuadas),
      anterior: sin(pct(b.detractores, b.puntuadas)),
      sentido: "menos-es-mejor",
      formato: "porcentaje",
      nota: "puntuaciones de 1 a 3",
    },
    {
      etiqueta: "Tasa de respuesta",
      actual: pct(a.puntuadas, a.enviadas),
      anterior: sin(pct(b.puntuadas, b.enviadas)),
      sentido: "mas-es-mejor",
      formato: "porcentaje",
      nota: "encuestas respondidas sobre entregas encuestadas",
    },
  ]
}

/** Las 4 métricas de NPS que se comparan. */
export function metricasNps(c: ComparativoYtd<NpsYtdFila>): MetricaYtd[] {
  const { actual: a, anterior: b, sinDatos } = c
  const sin = <T,>(v: T) => (sinDatos ? null : v)
  return [
    {
      etiqueta: "NPS",
      actual: a.nps,
      anterior: sin(b.nps),
      sentido: "mas-es-mejor",
      formato: "decimal",
      nota: "promotores − detractores, sobre 100",
    },
    {
      etiqueta: "Encuestas respondidas",
      actual: a.encuestas,
      anterior: sin(b.encuestas),
      sentido: "mas-es-mejor",
      formato: "entero",
    },
    {
      etiqueta: "Promotores",
      actual: pct(a.promotores, a.encuestas),
      anterior: sin(pct(b.promotores, b.encuestas)),
      sentido: "mas-es-mejor",
      formato: "porcentaje",
    },
    {
      etiqueta: "Detractores",
      actual: pct(a.detractores, a.encuestas),
      anterior: sin(pct(b.detractores, b.encuestas)),
      sentido: "menos-es-mejor",
      formato: "porcentaje",
    },
  ]
}

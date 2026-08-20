/**
 * Tipos del indicador "Desvío s/ tiempo planificado" (página /indicadores/
 * desvio-plan). Viven fuera del archivo "use server" (src/actions/desvio-plan.ts)
 * porque exportar tipos/const desde un módulo "use server" rompe el build de
 * Turbopack.
 */

export interface DesvioPlanDia {
  fecha: string
  /** Desvío % ponderado del día: (Σreal − Σplan) / Σplan. */
  desvio_pct: number
  rutas: number
  plan_min: number
  real_min: number
}

export interface DesvioPlanSemana {
  /** Etiqueta "S33". */
  semana: string
  desvio_pct: number
  rutas: number
}

export interface DesvioPlanChofer {
  chofer: string
  /** Patente más frecuente del chofer en el rango (egreso TML). */
  patente: string | null
  rutas: number
  plan_min: number
  real_min: number
  /** Desvío % ponderado del chofer en el rango. */
  desvio_pct: number
  /** Peor desvío % de una ruta individual del chofer. */
  peor_desvio_pct: number
}

export interface DesvioPlanRuta {
  fecha: string
  chofer: string
  patente: string | null
  nombre_ruta: string
  plan_min: number
  real_min: number
  desvio_pct: number
}

export interface DesvioPlanKpis {
  /** Umbrales del semáforo (de reuniones_indicadores_config o defaults). */
  meta_pct: number
  gatillo_pct: number
  /** Desvío % ponderado del mes en curso. */
  desvio_mes: number | null
  /** Desvío % ponderado del mes anterior. */
  desvio_mes_anterior: number | null
  /** Minutos totales por encima del plan en el mes en curso (puede ser negativo). */
  min_extra_mes: number
  rutas_mes: number
  /** % de rutas finalizadas limpias del rango que tienen plan (cobertura del dato). */
  pct_cobertura: number
  rutas_excluidas: number
  serie_diaria: DesvioPlanDia[]
  serie_semanal: DesvioPlanSemana[]
  por_chofer: DesvioPlanChofer[]
  /** Rutas individuales con mayor desvío en los últimos 30 días. */
  peores_rutas: DesvioPlanRuta[]
}

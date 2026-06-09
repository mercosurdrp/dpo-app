// Tipos y constantes de la vista de rechazos para el empleado.
// Viven fuera de rechazos-empleado.ts porque ese módulo es "use server" y solo
// puede exportar funciones async; exportar tipos/constantes desde él rompe el
// build de Turbopack.

export const META_RECHAZO_PCT = 1.7

export type PeriodoKey = "mes" | "mes_pasado" | "semana"

export interface RankingPatente {
  patente: string
  display: string
  eventos: number
  bultos: number
  hl: number
  hl_entregado: number
  tasa: number // 0–100
  denominador_confiable: boolean
  excede: boolean // tasa > META
}

export interface PorDia {
  fecha: string
  eventos: number
  bultos: number
  hl: number
  hl_entregado: number
  tasa: number
}

export interface PorMotivo {
  ds_rechazo: string
  eventos: number
  bultos: number
}

export interface RechazosEmpleadoData {
  periodo: PeriodoKey
  desde: string
  hasta: string
  label: string
  meta: number
  total_eventos: number
  total_bultos: number
  total_hl: number
  total_hl_entregado: number
  tasa_global: number
  cumple_meta: boolean
  camiones_exceden: number
  /** Camiones con denominador confiable, ordenados por tasa ASC (mejor primero). */
  ranking: RankingPatente[]
  /** Camiones con rechazos pero sin dato de entrega suficiente (no rankeables). */
  sin_dato: RankingPatente[]
  por_dia: PorDia[]
  por_motivo: PorMotivo[]
}

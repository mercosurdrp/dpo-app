/**
 * Tipos del detalle por día de los KPIs de Foxtrot en la matinal de Pampeana.
 * Viven fuera del archivo "use server" (src/actions/foxtrot-matinal.ts) porque
 * exportar tipos/const desde un módulo "use server" rompe el build de Turbopack
 * (tsc no lo detecta).
 */

export type FoxtrotKpiId =
  | "auto_fx_click_score"
  | "auto_fx_adherencia"
  | "auto_fx_resecuenciado"
  | "auto_fx_pct_finalizadas"
  | "auto_fx_entregas_ok"
  | "auto_fx_tiempo_ruta"
  | "auto_fx_tiempo_pdv"
  | "auto_fx_km"
  | "auto_fx_paradas_no_auth"

export interface FoxtrotKpiUnidadDetalle {
  patente: string | null
  chofer: string
  ruta: string
  valor: number | null
  texto: string | null
  finalizada: boolean
}

export interface FoxtrotKpiDia {
  kpi_id: FoxtrotKpiId
  titulo: string
  unidad: string
  /** Valor del día (igual al de la celda del tablero). */
  valor_dia: number | null
  detalle: FoxtrotKpiUnidadDetalle[]
}

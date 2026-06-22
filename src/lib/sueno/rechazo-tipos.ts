// Tipos del detalle fino de rechazos del Árbol del Sueño (Sin Dinero / Cerrado).
// Archivo sin "use server": seguro para exportar tipos y constantes.

/** KPIs del árbol que tienen el detalle enriquecido de rechazos. */
export const RECHAZO_KPIS = ["sin_dinero", "cerrado"] as const
export type RechazoKpiKey = (typeof RECHAZO_KPIS)[number]

export function esRechazoKpi(key: string): key is RechazoKpiKey {
  return (RECHAZO_KPIS as readonly string[]).includes(key)
}

/** Mapeo KPI del árbol → motivo de catalogo_rechazos (para el foco del plan). */
export const KPI_MOTIVO: Record<RechazoKpiKey, { id: number; ds: string }> = {
  sin_dinero: { id: 6, ds: "SIN DINERO" },
  cerrado: { id: 1, ds: "CERRADO" },
}

export interface RechazoPctMes {
  mes: number
  etiqueta: string
  cantTipo: number
  cantTotal: number
  pctCant: number | null
  bultosTipo: number
  bultosTotal: number
  pctBultos: number | null
}

export interface RechazoPctData {
  meses: RechazoPctMes[]
  /** Fila YTD agregada (suma de los meses). */
  ytd: {
    cantTipo: number
    cantTotal: number
    pctCant: number | null
    bultosTipo: number
    bultosTotal: number
    pctBultos: number | null
  }
}

export interface RechazoClienteRow {
  idCliente: number
  nombreCliente: string
  eventos: number
  bultos: number
  hl: number
}

export interface RechazoPlanOpciones {
  motivos: { id_rechazo: number; ds_rechazo: string }[]
  responsables: { id: string; nombre: string }[]
}

export const MES_LABEL_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

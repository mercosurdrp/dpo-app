/**
 * Huella de carbono (GHG Protocol) — tipos y parámetros por defecto.
 *
 * Este archivo lo importan tanto los server actions como los componentes de
 * cliente: acá no puede haber nada de servidor.
 *
 * El inventario se arma con lo que ya registran los sistemas:
 *  - Scope 1: gasoil de la flota propia (registro_combustible) + autoelevadores
 *    + recargas de refrigerante (carga manual).
 *  - Scope 2: electricidad comprada (kWh de las facturas, carga manual).
 *  - Scope 3: flete contratado de abastecimiento (tabla `viajes` de acarreo-rdf,
 *    km ida y vuelta del tarifario por planta).
 * La cerveza comprada queda EXCLUIDA: es huella de producción de CMQ y el
 * programa de distribuidoras (Galaxia 6.1.1) mide fletes/residuos/agua.
 */

export interface HuellaParams {
  /** kg CO₂e por litro de gasoil (combustión, GHG Protocol/DEFRA). */
  feGasoil: number
  /** kg CO₂e por kWh de red eléctrica argentina. */
  feKwh: number
  /** Consumo del camión de flete contratado, litros cada 100 km. */
  fleteConsumoL100: number
  /** km IDA Y VUELTA por planta de origen (del tarifario de fletes). */
  kmPlantas: Record<string, number>
  /** km ida y vuelta usado cuando la planta no está en el mapa. */
  kmDefault: number
  /** Relación litros de gasoil por HL VENDIDO (para estimar meses sin registro). */
  ratioLitrosHl: number
  /** Desde qué mes (YYYY-MM) el registro de combustible de flota es confiable. */
  gasoilConfiableDesde: string
  /** Autoelevadores: litros por hora medidos y horas por día (todas las unidades). */
  autoLitrosHora: number
  autoHorasDia: number
  /** Desde qué mes (YYYY-MM) hay medición real de combustible de autoelevador. */
  autoMedidoDesde: string
  /** GWP del gas refrigerante de las recargas (default R-404A = 3.922). */
  gwpRefrigerante: number
}

export const HUELLA_PARAMS_DEFAULT: HuellaParams = {
  feGasoil: 2.68,
  feKwh: 0.3,
  fleteConsumoL100: 35,
  kmPlantas: {
    ZARATE: 250,
    CAMPANA: 303,
    POMPEYA: 493,
    "MERCADO CENTRAL": 465,
    MORENO: 365,
    BERAZATEGUI: 513,
    QUILMES: 489,
    FASAN: 509,
  },
  kmDefault: 420,
  ratioLitrosHl: 0.66,
  gasoilConfiableDesde: "2026-05",
  autoLitrosHora: 3.44,
  autoHorasDia: 6.4,
  autoMedidoDesde: "2026-08",
  gwpRefrigerante: 3922,
}

/** Datos que no están en ningún sistema y se cargan a mano, por mes. */
export interface HuellaManualMes {
  /** kWh de las facturas de electricidad del mes. */
  kwh?: number | null
  /** kg de gas refrigerante recargado en el mes (service de cámaras/equipos). */
  refrigeranteKg?: number | null
  /** Litros de gasoil según facturas (pisa al registro/estimación del mes). */
  gasoilFacturaL?: number | null
  /** Litros reales de autoelevador del mes (pisa la estimación por horómetro). */
  autoelevadorL?: number | null
  notas?: string | null
}

export type FuenteDato = "registrado" | "estimado" | "factura" | "sin dato"

export interface HuellaMes {
  mes: string // YYYY-MM
  hl: number
  /** Scope 1 */
  gasoilFlotaL: number
  gasoilFuente: FuenteDato
  autoL: number
  autoFuente: FuenteDato
  refrigeranteKg: number
  s1: number // tCO₂e
  /** Scope 2 */
  kwh: number | null
  s2: number | null // tCO₂e (null = falta el dato)
  /** Scope 3 (flete de abastecimiento) */
  fleteViajes: number
  fleteKm: number
  s3: number // tCO₂e
  /** Totales */
  totalConocido: number // s1 + (s2 ?? 0) + s3
  intensidadKgHl: number | null // kg CO₂e/HL sobre lo conocido
}

export interface HuellaAnual {
  anio: number
  meses: HuellaMes[]
  totales: {
    hl: number
    s1: number
    s2: number | null
    s3: number
    totalConocido: number
    intensidadKgHl: number | null
    mesesSinKwh: number
    fleteViajes: number
    fleteKm: number
  }
  params: HuellaParams
  manual: Record<string, HuellaManualMes>
}

/** Meta anual de reducción (vive en app_config, clave huella:metas:<año>). */
export interface HuellaMeta {
  /** Objetivo de intensidad del año, en kg CO₂e por HL vendido. */
  intensidadObjetivo: number | null
  /** De dónde salió la meta (ej.: "−4 % anual sobre la base ene–jul 2026"). */
  base?: string | null
  notas?: string | null
}

export type FuentePlan = "camiones" | "autoelevadores" | "electricidad" | "acarreo" | "general"
export type EstadoPlan = "abierto" | "en_curso" | "cerrado" | "descartado"

/** Plan de acción de reducción (app_config, clave huella:plan:<uuid>). */
export interface HuellaPlan {
  id: string
  anio: number
  fuente: FuentePlan
  titulo: string
  descripcion?: string | null
  responsable?: string | null
  fechaObjetivo?: string | null // YYYY-MM-DD
  /** Reducción estimada en t CO₂e POR AÑO si el plan se cumple. */
  impactoTCO2e?: number | null
  estado: EstadoPlan
  creadoPor?: string | null
  createdAt: string
  updatedAt: string
}

export const FUENTE_PLAN_LABEL: Record<FuentePlan, string> = {
  camiones: "Camiones propios",
  autoelevadores: "Autoelevadores",
  electricidad: "Energía eléctrica",
  acarreo: "Camiones de acarreo",
  general: "General",
}

export const ESTADO_PLAN_LABEL: Record<EstadoPlan, string> = {
  abierto: "Abierto",
  en_curso: "En curso",
  cerrado: "Cerrado",
  descartado: "Descartado",
}

/** Referencias para la sección de comparación del informe. */
export const REFERENCIAS = {
  /** AB InBev global, Scope 1+2 de producción, 9M 2024. */
  abiS12KgHl: 4.48,
  metaCarbonoNeutral: 2040,
} as const

export const MES_LABEL: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
}

/** Normaliza el nombre libre de la planta a la clave del mapa de km. */
export function normalizarPlanta(planta: string | null | undefined): string {
  const s = (planta || "SIN PLANTA").toUpperCase().trim()
  if (/ZA[ÁA]?RATE|ZAEATE/.test(s)) return "ZARATE"
  if (/FRAN?[SC]ISCO/.test(s)) return "SAN FRANCISCO"
  if (/BERAZATEGUI/.test(s)) return "BERAZATEGUI"
  if (/MERCADO CENTRAL|SUBDEP MC|MC$/.test(s)) return "MERCADO CENTRAL"
  if (/CAMPANA/.test(s)) return "CAMPANA"
  if (/POMPEYA/.test(s)) return "POMPEYA"
  if (/MORENO/.test(s)) return "MORENO"
  if (/FASAN/.test(s)) return "FASAN"
  if (/QUILMES/.test(s)) return "QUILMES"
  return s
}

/** Dominios de autoelevadores en registro_combustible / checklists. */
export function esAutoelevador(dominio: string | null | undefined): boolean {
  return /HELI|AUTOEL|CLARK|TOYOTA|MONTACARG/i.test(dominio || "")
}

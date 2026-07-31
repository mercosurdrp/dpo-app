// Constantes y tipos del cumplimiento de SLA.
// 🚨 Viven fuera de actions/sla.ts porque ese archivo es "use server" y un
// módulo de Server Actions SOLO puede exportar funciones async (Turbopack
// rechaza exportar constantes/tipos desde ahí, aunque tsc no lo marque).

export const SLA_RUTEO_NOMBRE = "Tiempo de finalización del ruteo"
export const SLA_RUTEO_TARGET = 95

export const SLA_SYOP_NOMBRE = "Ventas ↔ Operaciones (entrega de preventa)"
export const SLA_SYOP_TARGET = 95

export const SLA_CAPACIDAD_NOMBRE = "Cumplimiento de capacidad del camión"
export const SLA_CAPACIDAD_TARGET = 95

export const SLA_PESO_NOMBRE = "Peso límite de camiones"
export const SLA_PESO_TARGET = 95
// Techo de peso NETO de producto ruteado por camión. Ningún viaje debería
// rutearse con carga que supere este peso: peso bruto máximo (PBT) − tara.
// El peso real del producto llega en ocupacion_bodega_diaria.peso_total (kg).
export const PESO_TARA_KG = 6500
export const PESO_BRUTO_KG = 15000
export const PESO_LIMITE_KG = PESO_BRUTO_KG - PESO_TARA_KG // 8500 kg (flota estándar)

// Excepciones por patente: camiones con tara/bruto distintos → otro neto.
//   • AE908DF ("el DF"): tara 4500 · bruto 11500 → neto 7000 kg.
export const PESO_LIMITE_POR_PATENTE: Record<string, number> = {
  AE908DF: 11500 - 4500, // 7000 kg
}

/** Límite de peso neto (kg) para una patente: su excepción o el estándar. */
export function pesoLimiteKg(patente: string | null | undefined): number {
  const p = (patente ?? "").trim().toUpperCase()
  return PESO_LIMITE_POR_PATENTE[p] ?? PESO_LIMITE_KG
}

export const SLA_PUSHED_NOMBRE = "Volumen no ruteado (Pushed)"
export const SLA_PUSHED_TARGET = 95

export const SLA_RECEPCION_NOMBRE = "Recepción de abastecimiento (acarreos)"
export const SLA_RECEPCION_TARGET = 95

// --- SLA equipos de frío: ventana lunes-miércoles --------------------------
export const SLA_EDF_NOMBRE = "Entrega y retiro de equipos de frío"
/**
 * Meta ESCALONADA. El baseline medido contra Chess (180 días a jul-2026) es
 * 45,8 % de los movimientos en camión dentro de la ventana: firmar 95 % de
 * arranque sería firmar un incumplimiento. `slaEdfTarget(year, month)` devuelve
 * la meta vigente según los meses transcurridos desde la firma.
 */
export const SLA_EDF_TARGET = 95
/** Primer mes de vigencia (YYYY-MM). Ajustar a la fecha real de firma. */
export const SLA_EDF_VIGENCIA_DESDE = "2026-08"
const SLA_EDF_ESCALONES = [
  { hastaMes: 3, target: 70 }, // meses 1-3
  { hastaMes: 6, target: 85 }, // meses 4-6
] as const

/** Meta vigente (%) para un mes dado, según el escalonamiento pactado. */
export function slaEdfTarget(year: number, month: number): number {
  const [y0, m0] = SLA_EDF_VIGENCIA_DESDE.split("-").map(Number)
  const transcurridos = (year - y0) * 12 + (month - m0) + 1
  if (transcurridos < 1) return SLA_EDF_ESCALONES[0].target
  for (const e of SLA_EDF_ESCALONES) {
    if (transcurridos <= e.hastaMes) return e.target
  }
  return SLA_EDF_TARGET
}

/** Días de la semana habilitados para mover equipos de frío en camión. */
export const EDF_DIAS_PERMITIDOS = [1, 2, 3] as const // lunes, martes, miércoles
export const EDF_DIAS_PERMITIDOS_LABEL = "lunes, martes y miércoles"

/**
 * Patente argentina: formato viejo (AAA000) o Mercosur (AA000AA). Es lo que
 * distingue un movimiento que salió DENTRO DE LA CARGA DE UN CAMIÓN de uno
 * emitido fuera de una carga (`MOSTRADOR RAMALLO`, `SEGUNDA VUELTA`), que no
 * entra al SLA y puede hacerse cualquier día.
 */
const PATENTE_RE = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/

export function esPatenteCamion(reparto: string | null | undefined): boolean {
  const r = (reparto ?? "").toUpperCase().replace(/[\s-]/g, "")
  return PATENTE_RE.test(r)
}

/** Motivos tipificados de excepción (los carga el JDL/JDV a posteriori). */
export const EDF_MOTIVOS_EXCEPCION = [
  { valor: "cliente_nuevo_urgente", label: "Cliente nuevo urgente" },
  { valor: "equipo_roto_sin_frio", label: "Equipo roto / PDV sin frío" },
  { valor: "recambio_garantia", label: "Recambio en garantía" },
  { valor: "requerimiento_marca", label: "Requerimiento de la marca" },
  { valor: "reprogramacion_cliente", label: "Reprogramación del cliente" },
  { valor: "otro", label: "Otro (detallar)" },
] as const

export type EdfMotivoExcepcion = (typeof EDF_MOTIVOS_EXCEPCION)[number]["valor"]

export function edfMotivoLabel(motivo: string | null | undefined): string {
  return EDF_MOTIVOS_EXCEPCION.find((m) => m.valor === motivo)?.label ?? "—"
}

/**
 * Movimiento de equipo de frío fuera de la ventana lunes-miércoles, con su
 * excepción si ya fue registrada. `excepcion: null` = falta justificar.
 * 🚨 Vive acá y no en actions/sla.ts porque ese archivo es "use server" y no
 * puede exportar tipos.
 */
export interface MovimientoEdfPendiente {
  id: string
  fecha_entrega: string
  tipo_doc: string
  reparto: string | null
  id_cliente: number | null
  des_articulo: string | null
  cantidad: number
  excepcion: {
    motivo: string
    motivoLabel: string
    detalle: string | null
    autoriza_jdl: string
    autoriza_jdv: string
  } | null
}

export const SLA_CARGA_NOMBRE = "SLA de carga (reducir retrasos)"
export const SLA_CARGA_TARGET = 95
// Hora límite ARG de carga: todos los camiones ruteados el día D deben quedar
// cargados antes de las 07:00 del día de reparto (D+1). El blob de carga trae
// fecha ('YYYY-MM-DD') y hora ('HH:mm:ss') ya en hora Argentina, así que el
// corte se compara directo por string.
export const CARGA_LIMITE_HORA = "07:00:00"

// --- SLA #7 recepción: ventana de arribo + tiempo de descarga --------------
// La recepción opera 07:00–17:00, pero el cumplimiento de descarga ≤ 3 h se
// EXIGE solo a los arribos dentro de la ventana 08:00–16:00 (ARG). Los arribos
// fuera de esa franja no se computan en el SLA (cumpleRecepcion → null).
export const RECEPCION_VENTANA_INICIO_MIN = 8 * 60 // 08:00
export const RECEPCION_VENTANA_FIN_MIN = 16 * 60 // 16:00
export const RECEPCION_MAX_DESCARGA_MIN = 180 // ≤ 3 h
// Pico: el camión no se cerró en la pantalla y quedó abierto horas. No es una
// demora de descarga, así que no se computa (mismo criterio y mismo umbral que
// el ATCT del 6.3 en acarreo-rdf, UMBRAL_PICO_MIN). Jun-jul 2026: 4 casos, de
// 11 a 18,6 h, sin ningún viaje real entre las 6 y las 11 h.
export const RECEPCION_PICO_MIN = 480 // > 8 h de ciclo

/** Minutos desde medianoche en hora Argentina (UTC-3 fijo, sin DST). */
function minutosArgentina(iso: string): number {
  const arg = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000)
  return arg.getUTCHours() * 60 + arg.getUTCMinutes()
}

/**
 * Un ciclo de más de 8 h no es una demora: es un camión que quedó abierto en la
 * pantalla y se cerró mucho después. Se mide hasta la salida cuando está
 * registrada (desde el 27-07-2026); una salida sellada en el mismo instante que
 * el fin de descarga es el cierre retroactivo de los viajes viejos, no un dato.
 */
export function esPicoRecepcion(
  arriboIso: string,
  finIso: string | null,
  salidaIso: string | null = null,
): boolean {
  const cierre = salidaIso && salidaIso !== finIso ? salidaIso : finIso
  if (!cierre) return false
  const ciclo = (new Date(cierre).getTime() - new Date(arriboIso).getTime()) / 60000
  return ciclo > RECEPCION_PICO_MIN
}

/**
 * Cumplimiento de una recepción para el SLA #7. Devuelve:
 *   true  → arribo en ventana 08:00–16:00 y descarga ≤ 3 h
 *   false → arribo en ventana pero descarga > 3 h
 *   null  → no evaluable (sin fin de descarga, arribo fuera de 08:00–16:00 o pico)
 */
export function cumpleRecepcion(
  arriboIso: string,
  finIso: string | null,
  salidaIso: string | null = null,
): boolean | null {
  const min = minutosArgentina(arriboIso)
  if (min < RECEPCION_VENTANA_INICIO_MIN || min >= RECEPCION_VENTANA_FIN_MIN) return null
  if (!finIso) return null
  if (esPicoRecepcion(arriboIso, finIso, salidaIso)) return null
  const dur = (new Date(finIso).getTime() - new Date(arriboIso).getTime()) / 60000
  return dur <= RECEPCION_MAX_DESCARGA_MIN
}

// --- Umbrales DIARIOS configurables ------------------------------------------
/**
 * Un día cumple capacidad si la ocupación promedio (CEq/TARGET_CEQ × 100) ≥
 * este valor. Con TARGET_CEQ = 525, un 100% equivale a "promedio de CEq ≥ 525"
 * (el mínimo de carga pactado en el SLA, sin máximo).
 */
export const CAPACIDAD_MIN_PCT = 100

// Estado de un día para un SLA:
//   "si" = cumple · "no" = no cumple · "na" = no aplica (ej. domingo) ·
//   "sd" = sin dato (día futuro o ruteo no cerrado) ·
//   "just" = fuera de lo pactado pero con EXCEPCIÓN AUTORIZADA registrada.
// 🚨 "just" CUENTA COMO CUMPLIDO en el %: se pinta distinto (amarillo) sólo
// para poder seguir la tendencia de excepciones, no para penalizar.
export type EstadoCumplimiento = "si" | "no" | "na" | "sd" | "just"

/** Estados que suman al numerador del % de cumplimiento. */
export function cuentaComoCumplido(e: EstadoCumplimiento): boolean {
  return e === "si" || e === "just"
}

export interface CumplimientoSlaFila {
  codigo: string
  nombre: string
  target: number
  porcentaje: number | null // % de cumplimiento del mes
  cumplidos: number
  totalAplica: number // denominador (días medibles del mes)
  /** Estado por día del mes; índice 0 = día 1. Largo = días del mes. */
  dias: EstadoCumplimiento[]
  /**
   * Si está presente, la columna MTD muestra este texto (acumulado informativo,
   * ej. "47 bultos") en vez del % — para SLA de procedimiento como el de
   * volumen no ruteado, cuyo cumplimiento es siempre "Sí".
   */
  mtdLabel?: string
}

export interface CumplimientoMes {
  year: number
  month: number
  diasDelMes: number // 28..31
  filas: CumplimientoSlaFila[]
}

/** Detalle de un día/SLA para el modal al hacer clic en una celda. */
export interface DetalleDiaSla {
  codigo: string
  nombre: string
  fecha: string // YYYY-MM-DD
  diaSemana: string // "Lunes".."Domingo"
  estado: EstadoCumplimiento
  metaLabel: string // ej. "Límite ≤ 09:00", "Ocupación ≥ 90%", "No ruteado ≤ 5%"
  valorLabel: string // ej. "08:47", "92%", "3,2%"
  /** Desglose adicional (por patente, horarios, bultos, etc.). */
  filas: { label: string; valor: string }[]
  nota?: string // mensaje cuando es "sin dato" o "no aplica"
  /** Comentario/justificativo cargado en /ruteo (fin de preventa o cierre). */
  comentario?: string | null
}

// ── Cumplimiento por rango de fechas (para la Reunión Ventas-Logística) ──
export interface CumplimientoRangoFila {
  codigo: string
  nombre: string
  target: number
  porcentaje: number | null // % en el rango (cumplidos / días que aplican)
  cumplidos: number
  totalAplica: number
  dias: { fecha: string; estado: EstadoCumplimiento }[]
}

export interface CumplimientoRango {
  desde: string
  hasta: string
  filas: CumplimientoRangoFila[]
}

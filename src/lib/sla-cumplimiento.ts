// Constantes y tipos del cumplimiento de SLA.
// 🚨 Viven fuera de actions/sla.ts porque ese archivo es "use server" y un
// módulo de Server Actions SOLO puede exportar funciones async (Turbopack
// rechaza exportar constantes/tipos desde ahí, aunque tsc no lo marque).

import { esFeriado, esPosteriorAFeriado } from "@/lib/feriados-ar"
import { OBJETIVO_CEQ } from "@/lib/ocupacion-bodega"

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
 * Objetivo mensual, igual que el resto de los SLA de la app y desde el primer
 * mes: sin escalonamiento (decisión del 31-07-2026). El baseline previo al
 * acuerdo era 46,4 %, así que los primeros meses van a dar en rojo hasta que la
 * programación de las solicitudes se acomode — es el punto del indicador.
 */
export const SLA_EDF_TARGET = 95
/**
 * 🚨 Primer día MEDIDO. Los movimientos anteriores SÍ se sincronizan (sirven de
 * baseline para la reunión de firma) pero NO se evalúan: el acuerdo no se
 * aplica retroactivamente. Los días previos quedan en "no aplica".
 * Decidido el 31-07-2026: se empieza a medir el 01-08.
 */
export const SLA_EDF_MIDE_DESDE = "2026-08-01"
/** Días de la semana habilitados para mover equipos de frío en camión. */
export const EDF_DIAS_PERMITIDOS = [1, 2, 3] as const // lunes, martes, miércoles
export const EDF_DIAS_PERMITIDOS_LABEL = "lunes, martes y miércoles"

/**
 * ¿La fecha habilita mover un equipo de frío en camión?
 *
 * Tres condiciones: cae lunes, martes o miércoles; no es feriado; y **el día
 * anterior no fue feriado** — el día después de un feriado el camión sale con
 * la carga acumulada de dos días y no entra un equipo.
 *
 * 🚨 No alcanza con la columna generada `en_ventana` de `edf_movimientos`, que
 * sólo mira el día de la semana: el feriado se resuelve acá, en TypeScript,
 * contra el calendario de [[feriados-ar]].
 *
 * Ejemplo: el lunes 17-08-2026 (San Martín) es feriado ⇒ ese lunes y el martes
 * 18 quedan excluidos, y esa semana el único día habilitado es el miércoles 19.
 */
export function edfDiaHabilitado(fecha: string): boolean {
  const [y, m, d] = fecha.split("-").map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (!(EDF_DIAS_PERMITIDOS as readonly number[]).includes(dow)) return false
  if (esFeriado(fecha)) return false
  return !esPosteriorAFeriado(fecha)
}

/** Por qué un día no habilita mover equipos — para mostrar en el detalle. */
export function edfMotivoNoHabilitado(fecha: string): string | null {
  if (edfDiaHabilitado(fecha)) return null
  if (esFeriado(fecha)) return "feriado"
  if (esPosteriorAFeriado(fecha)) return "día posterior a feriado"
  return "fuera de la ventana lunes a miércoles"
}

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

/**
 * Titulares de las dos jefaturas que autorizan en conjunto. Prellenan el
 * formulario de excepción (editables: puede autorizar un reemplazo).
 */
export const EDF_JDL_TITULAR = "Sebastián Roselli"
export const EDF_JDV_TITULAR = "Nicolás Lescoulie"

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
// La recepción opera 07:00–17:00 y el compromiso de descarga ≤ 3 h corre dentro
// de la ventana 08:00–16:00 (ARG):
//   · arribo ANTES de las 08:00 → el camión SÍ se mide, pero el reloj arranca a
//     las 08:00 (la espera hasta que abre la ventana no es demora nuestra).
//   · arribo desde las 16:00 → fuera del compromiso, no se computa (→ null).
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

/** Un arribo anterior a las 08:00: se mide, pero con el reloj corrido a las 08:00. */
export function arriboAnticipadoRecepcion(arriboIso: string): boolean {
  return minutosArgentina(arriboIso) < RECEPCION_VENTANA_INICIO_MIN
}

/**
 * Momento (epoch ms) en que empieza a correr el compromiso de descarga: el
 * arribo, o las 08:00 de ese día si el camión llegó antes de que abra la
 * ventana. Es el "cero" tanto del tiempo de descarga como del ciclo del pico.
 */
export function inicioRelojRecepcion(arriboIso: string): number {
  const t = new Date(arriboIso).getTime()
  if (!arriboAnticipadoRecepcion(arriboIso)) return t
  // 08:00 ARG del mismo día calendario del arribo, de vuelta a epoch real.
  const arg = new Date(t - 3 * 60 * 60 * 1000)
  const ochoArg = Date.UTC(
    arg.getUTCFullYear(),
    arg.getUTCMonth(),
    arg.getUTCDate(),
    RECEPCION_VENTANA_INICIO_MIN / 60,
    0,
    0,
  )
  return ochoArg + 3 * 60 * 60 * 1000
}

/**
 * Un ciclo de más de 8 h no es una demora: es un camión que quedó abierto en la
 * pantalla y se cerró mucho después. Se mide hasta la salida cuando está
 * registrada (desde el 27-07-2026); una salida sellada en el mismo instante que
 * el fin de descarga es el cierre retroactivo de los viajes viejos, no un dato.
 * Arranca en el reloj del compromiso, no en el arribo: la espera de un camión
 * que llegó de madrugada no debe disparar el pico y sacarlo de la medición.
 */
export function esPicoRecepcion(
  arriboIso: string,
  finIso: string | null,
  salidaIso: string | null = null,
): boolean {
  const cierre = salidaIso && salidaIso !== finIso ? salidaIso : finIso
  if (!cierre) return false
  const ciclo = (new Date(cierre).getTime() - inicioRelojRecepcion(arriboIso)) / 60000
  return ciclo > RECEPCION_PICO_MIN
}

/**
 * Cumplimiento de una recepción para el SLA #7. El reloj arranca en el arribo,
 * o a las 08:00 si el camión llegó antes (compromiso de ventana). Devuelve:
 *   true  → descarga ≤ 3 h desde el inicio del reloj
 *   false → descarga > 3 h desde el inicio del reloj
 *   null  → no evaluable (sin fin de descarga, arribo desde las 16:00 o pico)
 */
export function cumpleRecepcion(
  arriboIso: string,
  finIso: string | null,
  salidaIso: string | null = null,
): boolean | null {
  if (minutosArgentina(arriboIso) >= RECEPCION_VENTANA_FIN_MIN) return null
  if (!finIso) return null
  if (esPicoRecepcion(arriboIso, finIso, salidaIso)) return null
  const dur = (new Date(finIso).getTime() - inicioRelojRecepcion(arriboIso)) / 60000
  return dur <= RECEPCION_MAX_DESCARGA_MIN
}

// --- SLA de cierre de casos NPS y RMD (ent_nps / ent_rmd) -------------------
// Un CASO es una encuesta que dejó al cliente en detractor o pasivo. El reloj
// arranca en la FECHA DE LA ENCUESTA —no en la creación del plan, que puede ser
// meses después— y se detiene cuando el plan de acción de ese cliente queda
// cerrado. Un detractor al que nunca se le abre un plan no desaparece de la
// medición: al vencer el plazo cuenta como incumplido.
//
// En el calendario el caso se ubica por su VENCIMIENTO, y mientras siga vencido
// sin cerrar ensucia también los días siguientes (ver `deudaAbierta` en
// actions/sla.ts). `cierreTardio` es lo que apaga ese arrastre.

export const SLA_CASOS_NPS_NOMBRE = "Cierre de casos NPS (detractores y pasivos)"
export const SLA_CASOS_RMD_NOMBRE = "Cierre de casos RMD (detractores y pasivos)"
export const SLA_CASOS_TARGET = 95

/**
 * 🚨 Primer día MEDIDO. Las encuestas anteriores están cargadas (baseline para
 * la reunión de firma) pero NO se evalúan: el acuerdo no es retroactivo.
 * Los días previos quedan en "no aplica". Decidido el 07-08-2026.
 */
export const SLA_CASOS_MIDE_DESDE = "2026-08-01"

export const CASO_PLAZO_DETRACTOR_DIAS = 30
export const CASO_PLAZO_PASIVO_DIAS = 45

export type CasoCategoria = "detractor" | "pasivo"

export function plazoCasoDias(categoria: CasoCategoria): number {
  return categoria === "detractor"
    ? CASO_PLAZO_DETRACTOR_DIAS
    : CASO_PLAZO_PASIVO_DIAS
}

export function casoCategoriaLabel(categoria: CasoCategoria): string {
  return categoria === "detractor" ? "Detractor" : "Pasivo"
}

/**
 * Categoría de una puntuación RMD (escala 1-5). `null` = promotor: no genera
 * caso. El corte 1-3 = detractor es el mismo que usa el módulo /rmd; el 4 entra
 * como pasivo, con el plazo largo.
 */
export function categoriaRmd(puntuacion: number): CasoCategoria | null {
  if (puntuacion <= 3) return "detractor"
  if (puntuacion === 4) return "pasivo"
  return null
}

/** Categoría de una encuesta NPS ('Detractor' | 'Passive' | 'Promoter'). */
export function categoriaNps(categoria: string): CasoCategoria | null {
  if (categoria === "Detractor") return "detractor"
  if (categoria === "Passive") return "pasivo"
  return null
}

/** 'YYYY-MM-DD' + n días, sin corrimiento por zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Último día en que el caso puede cerrarse cumpliendo el acuerdo. */
export function vencimientoCaso(
  fechaCaso: string,
  categoria: CasoCategoria,
): string {
  return sumarDias(fechaCaso, plazoCasoDias(categoria))
}

// "pendiente" = todavía dentro del plazo y sin cerrar. No cuenta ni en el
// numerador ni en el denominador: el caso aún no se puede juzgar.
export type EstadoCaso = "cumplido" | "incumplido" | "pendiente"

export interface EvaluacionCaso {
  estado: EstadoCaso
  /** Cierre que atiende el caso (dentro del plazo), si existe. */
  cierre: string | null
  vencimiento: string
  /** Cierre más temprano posterior al caso, aunque haya llegado tarde. */
  cierreTardio: string | null
}

/**
 * Evalúa un caso contra los cierres de plan del cliente.
 *
 * 🚨 `cierres` son las fechas en que un plan de ESE cliente quedó completado.
 * Un cierre anterior al caso no lo atiende (cerró otra cosa), y uno posterior
 * al vencimiento llega tarde: el caso incumple igual, pero guardamos la fecha
 * para poder mostrar cuánto se pasó.
 */
export function evaluarCaso(
  fechaCaso: string,
  categoria: CasoCategoria,
  cierres: string[],
  hoy: string,
): EvaluacionCaso {
  const vencimiento = vencimientoCaso(fechaCaso, categoria)
  const posteriores = cierres.filter((c) => c >= fechaCaso).sort()
  const enPlazo = posteriores.find((c) => c <= vencimiento) ?? null
  const cierreTardio = posteriores[0] ?? null
  if (enPlazo) {
    return { estado: "cumplido", cierre: enPlazo, vencimiento, cierreTardio }
  }
  // Sin cierre en plazo: incumple recién cuando el plazo venció.
  const estado: EstadoCaso = hoy > vencimiento ? "incumplido" : "pendiente"
  return { estado, cierre: null, vencimiento, cierreTardio }
}

/** Caso individual, para el detalle del día. */
export interface CasoSlaDetalle {
  cod_cliente: number
  nombre_cliente: string | null
  categoria: CasoCategoria
  /** Score NPS (0-10) o puntuación RMD (1-5). */
  valor: number
  fecha: string
  evaluacion: EvaluacionCaso
}

// --- Umbrales DIARIOS configurables ------------------------------------------
/**
 * Un día cumple capacidad si el promedio de CEq de los camiones alcanza el
 * mínimo de carga pactado (sin máximo). Se compara en CEq y no en porcentaje:
 * el % de ocupación mide cuánto se llenó la bodega (100% = camión lleno), que
 * es otra cosa que el mínimo comercial.
 */
export const CAPACIDAD_MIN_CEQ = OBJETIVO_CEQ

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

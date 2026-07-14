/**
 * WNP (productividad de Depósito, HL/HH) — numerador y denominador.
 *
 * NUMERADOR — "HL vendidos", la misma definición que la pestaña Ventas del
 * cuadro mensual: `ventas_diarias` (distribuido Chess+Gestión) +
 * `ventas_mostrador_diarias` (mostrador). El mostrador se PRORRATEA entre los
 * días operativos del mes en proporción a lo distribuido: Chess lo imputa casi
 * todo al último día del mes (31-mar/26: 3.295 HL en una sola línea "SEGUNDA
 * VUELTA"), lo que dispara el WNP de ese día (47,66) y deprime el resto. El
 * prorrateo no altera el total del mes — sigue cerrando exacto contra el cuadro
 * mensual — solo reparte en qué día cae. Decisión del usuario 2026-07-14.
 *
 * DENOMINADOR — horas del personal de Depósito, por persona y por día:
 *   1. ausencia cargada (`ausentismo_eventos`) → 0 hs, no se completa;
 *   2. fichaje biométrico válido (par E+S) → sus horas REALES;
 *   3. sin fichaje y sin ausencia → jornada teórica (el reloj falló ese día);
 *   4. el supervisor NO ficha nunca → siempre jornada teórica.
 *
 * El punto 3 existe porque el reloj ZKTeco se cae seguido (9-14/jul/26: días
 * enteros sin marcas). Antes, un día con fichaje parcial dividía el HL de todo
 * el depósito por las horas de los pocos que ficharon y publicaba disparates
 * (10-jul: 1 de 8 personas, 3,12 hs ⇒ WNP 81,83 contra una meta de 6).
 */

import { esFeriado } from "@/lib/feriados-ar"

/** Los 8 operarios de Depósito que fichan. Excluye a Cejas (42323256). */
export const LEGAJOS_WNP_OPERARIOS = [
  30, 107, 110, 112, 135, 36467481, 43907801, 425283564,
] as const

/** Supervisor de Almacén (Altube Esteban): no ficha, jornada teórica. */
export const LEGAJO_WNP_SUPERVISOR = 201

/**
 * El reloj biométrico arrancó el 2026-03-31. Antes no hay fichaje que reparar:
 * el WNP diario no existe y NO se rellena (si no, ene/feb saldrían inventados).
 */
export const WNP_FICHAJE_DESDE = "2026-03-31"

/** Jornada teórica: 8 hs de lunes a viernes, 4 hs el sábado, 0 el domingo. */
export const WNP_HS_LUNES_A_VIERNES = 8
export const WNP_HS_SABADO = 4

export type WnpEstadoPersona = "fichado" | "estimado" | "ausente" | "supervisor"

export type WnpPersonaDia = {
  legajo: number
  nombre: string
  estado: WnpEstadoPersona
  horas: number
}

export type WnpDia = {
  fecha: string
  /** HL vendidos del día (distribuido + mostrador prorrateado). */
  hl: number
  /** Horas-hombre computadas del día. */
  horas: number
  personas: WnpPersonaDia[]
  /** Cuántas horas del día son estimadas (el reloj no las registró). */
  horasEstimadas: number
  /** true si alguna persona quedó estimada: el día no tiene fichaje completo. */
  incompleto: boolean
}

/** Día de la semana en UTC (0=domingo … 6=sábado). Mediodía para no correrse de día. */
function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

/**
 * Jornada teórica de la fecha. Domingo y feriado = 0: no se trabaja, así que no
 * hay nada que rellenar. Quien haya trabajado igual cuenta con sus horas reales
 * del fichaje; lo que no se hace es IMPUTARLE la jornada a quien no fichó.
 */
export function jornadaTeorica(fecha: string): number {
  if (esFeriado(fecha)) return 0
  const d = diaSemana(fecha)
  if (d === 0) return 0
  if (d === 6) return WNP_HS_SABADO
  return WNP_HS_LUNES_A_VIERNES
}

/**
 * Reparte el mostrador del período entre los días con venta, en proporción a lo
 * distribuido de cada día. Σ resultado === Σ distribuido + Σ mostrador.
 */
export function prorratearHlVendidos(
  distribuidoPorFecha: Record<string, number>,
  mostradorPorFecha: Record<string, number>,
): Record<string, number> {
  const totalDist = Object.values(distribuidoPorFecha).reduce((a, b) => a + b, 0)
  const totalMost = Object.values(mostradorPorFecha).reduce((a, b) => a + b, 0)
  // Sin distribuido no hay sobre qué prorratear: se devuelve tal cual.
  if (totalDist <= 0) return { ...distribuidoPorFecha }

  const factor = (totalDist + totalMost) / totalDist
  const out: Record<string, number> = {}
  for (const [fecha, hl] of Object.entries(distribuidoPorFecha)) {
    out[fecha] = hl * factor
  }
  return out
}

/**
 * Horas del día por persona, aplicando la cascada ausencia → fichaje → teórica.
 * `fichajePorFecha[fecha][legajo]` = horas reales (solo pares E+S con horas > 0).
 * `ausentePorFecha` = set de claves "fecha|legajo".
 */
export function calcularHorasDia(
  fecha: string,
  fichajePorFecha: Record<string, Record<number, number>>,
  ausentePorFecha: Set<string>,
  nombrePorLegajo: Record<number, string>,
): WnpDia {
  const personas: WnpPersonaDia[] = []
  const teorica = jornadaTeorica(fecha)
  const fichajeDia = fichajePorFecha[fecha] ?? {}
  let horas = 0
  let horasEstimadas = 0

  const nombre = (legajo: number) => nombrePorLegajo[legajo] ?? `Legajo ${legajo}`

  for (const legajo of LEGAJOS_WNP_OPERARIOS) {
    if (ausentePorFecha.has(`${fecha}|${legajo}`)) {
      personas.push({ legajo, nombre: nombre(legajo), estado: "ausente", horas: 0 })
      continue
    }
    const real = fichajeDia[legajo] ?? 0
    if (real > 0) {
      horas += real
      personas.push({ legajo, nombre: nombre(legajo), estado: "fichado", horas: real })
      continue
    }
    // Sin fichaje y sin ausencia: el reloj no lo registró ⇒ jornada teórica.
    if (teorica > 0) {
      horas += teorica
      horasEstimadas += teorica
      personas.push({ legajo, nombre: nombre(legajo), estado: "estimado", horas: teorica })
    }
  }

  // Supervisor: no ficha nunca, se le imputa la jornada teórica salvo ausencia.
  const supAusente = ausentePorFecha.has(`${fecha}|${LEGAJO_WNP_SUPERVISOR}`)
  if (!supAusente && teorica > 0) {
    horas += teorica
    personas.push({
      legajo: LEGAJO_WNP_SUPERVISOR,
      nombre: nombre(LEGAJO_WNP_SUPERVISOR),
      estado: "supervisor",
      horas: teorica,
    })
  } else if (supAusente) {
    personas.push({
      legajo: LEGAJO_WNP_SUPERVISOR,
      nombre: nombre(LEGAJO_WNP_SUPERVISOR),
      estado: "ausente",
      horas: 0,
    })
  }

  return {
    fecha,
    hl: 0, // lo completa el caller con el HL prorrateado
    horas,
    personas,
    horasEstimadas,
    incompleto: horasEstimadas > 0,
  }
}

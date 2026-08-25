/**
 * WNP (productividad de Depósito, HL/HH) — numerador y denominador.
 *
 * NUMERADOR — "HL vendidos", la misma definición que la pestaña Ventas del
 * cuadro mensual: `ventas_diarias` (distribuido Chess+Gestión) +
 * `ventas_mostrador_diarias` NETO (FCVTA mostrador + PRVTA presupuesto −
 * DVVTA notas de crédito − PRDVO devoluciones; la tabla las guarda a todas en
 * valor absoluto, ver `./datos`). El mostrador se PRORRATEA entre los
 * días operativos del mes en proporción a lo distribuido: Chess lo imputa casi
 * todo al último día del mes (31-mar/26: 3.295 HL en una sola línea "SEGUNDA
 * VUELTA"), lo que dispara el WNP de ese día (47,66) y deprime el resto. El
 * prorrateo no altera el total del mes — sigue cerrando exacto contra el cuadro
 * mensual — solo reparte en qué día cae. Decisión del usuario 2026-07-14.
 *
 * 🚨 EL NUMERADOR VA CORRIDO UN DÍA HÁBIL (2026-08-25). La fecha de la venta es
 * la de ENTREGA —verificado contra Chess: en las 5 rutas del 24/8/26
 * `fechaComprobante` = `fechaEntrega` = 24/8, con pedidos de preventa del 18 al
 * 22—, y el depósito prepara HOY lo que sale MAÑANA. Dividir la salida del día
 * por las horas del mismo día compara el trabajo de ayer contra la gente de
 * hoy: en agosto/26 eso dibujaba una sierra de lunes (4,12) a sábado (9,13),
 * porque el sábado despachaba lo pickeado el viernes (8 hs) sobre media jornada
 * y el lunes despachaba lo pickeado el sábado (4 hs) sobre jornada completa.
 * Por eso cada venta se imputa al día hábil ANTERIOR a su entrega, que es el
 * que la preparó (`imputarAlDiaDePicking`). Pedido del usuario 2026-08-25.
 *
 * DENOMINADOR — horas del personal de Depósito, por persona y por día:
 *   1. ausencia cargada → 0 hs, no se completa. Vale de las DOS fuentes donde
 *      se carga una ausencia en la app: la novedad diaria de /asistencia
 *      (`asistencia_novedades`: vacaciones, licencia médica, ausente,
 *      Pergamino) y el evento de /ausentismo (`ausentismo_eventos`);
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
  /** Solo en `ausente`: por qué (Vacaciones, Licencia médica, …), para el popover. */
  motivo?: string
}

export type WnpDia = {
  fecha: string
  /** HL entregados al día hábil SIGUIENTE = lo que este día se preparó. */
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
 * Corre el numerador al día que hizo el trabajo: cada venta se imputa al día
 * hábil ANTERIOR a su fecha de entrega (ver el encabezado del módulo).
 *
 * `diasLaborales` son los días en que el depósito estuvo abierto —los que
 * terminaron con horas > 0—, en orden. Se usan esos y no "de lunes a sábado"
 * para que un feriado, un domingo trabajado o un paro caigan solos en su lugar:
 * si el lunes 17/8 fue feriado, lo que salió el martes 18 lo pickeó el sábado
 * 15. Varias fechas de venta pueden caer en el mismo día de picking (el
 * domingo con 8 bultos sueltos se suma al lunes), y por eso acumula en vez de
 * pisar.
 *
 * Las ventas anteriores al primer día laboral del rango se descartan: su día de
 * picking cae fuera de la ventana pedida (es del período anterior).
 */
export function imputarAlDiaDePicking(
  porFechaDeEntrega: Record<string, number>,
  diasLaborales: string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  let i = 0
  for (const entrega of Object.keys(porFechaDeEntrega).sort()) {
    while (i < diasLaborales.length && diasLaborales[i] < entrega) i++
    // `i` quedó en el primer día laboral >= entrega ⇒ el anterior es el que preparó.
    if (i === 0) continue
    const picking = diasLaborales[i - 1]
    out[picking] = (out[picking] ?? 0) + porFechaDeEntrega[entrega]
  }
  return out
}

/** `fecha` + `dias` (ambos en UTC, mediodía para no correrse por husos). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
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
 * `ausentePorFecha` = mapa de clave "fecha|legajo" → motivo de la ausencia
 * ("Vacaciones", "Licencia médica", …) para mostrarlo en el popover.
 */
export function calcularHorasDia(
  fecha: string,
  fichajePorFecha: Record<string, Record<number, number>>,
  ausentePorFecha: Map<string, string>,
  nombrePorLegajo: Record<number, string>,
): WnpDia {
  const personas: WnpPersonaDia[] = []
  const teorica = jornadaTeorica(fecha)
  const fichajeDia = fichajePorFecha[fecha] ?? {}
  let horas = 0
  let horasEstimadas = 0

  const nombre = (legajo: number) => nombrePorLegajo[legajo] ?? `Legajo ${legajo}`

  for (const legajo of LEGAJOS_WNP_OPERARIOS) {
    const motivo = ausentePorFecha.get(`${fecha}|${legajo}`)
    if (motivo !== undefined) {
      personas.push({
        legajo,
        nombre: nombre(legajo),
        estado: "ausente",
        horas: 0,
        motivo,
      })
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
  const motivoSup = ausentePorFecha.get(`${fecha}|${LEGAJO_WNP_SUPERVISOR}`)
  const supAusente = motivoSup !== undefined
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
      motivo: motivoSup,
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

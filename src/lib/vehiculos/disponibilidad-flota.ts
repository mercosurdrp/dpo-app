// Cálculo de disponibilidad y utilización de flota por mes.
// Extraído de seguimiento-flota.tsx para poder reusarlo en el tablero de
// indicadores (serie de varios meses) sin duplicar la lógica.

import type {
  DiaRuteo,
  FlotaIndisponibilidad,
  MantenimientoRealizado,
  VehiculoSector,
  VehiculoTipo,
} from "@/types/database"

// Objetivo histórico de disponibilidad de flota (planilla histórica: 98%).
export const TARGET_DISP = 98

export interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
  sector?: VehiculoSector | null
  modelo?: string | null
  anio?: number | null
}

// LIB = día no laboral (ningún camión de la flota ruteó ese día): disponible pero
// NO cuenta para la utilización (no era un día de trabajo).
export type EstadoDiaFlota = "PMC" | "PMP" | "IND" | "DRT" | "DSP" | "LIB"

export interface FilaDisp {
  dominio: string
  modelo: string | null
  anio: number | null
  diasPeriodo: number
  pmc: number
  pmp: number
  ind: number
  drt: number
  dsp: number
  lib: number
  parado: number
  disponibles: number
  pctDisp: number | null
  pctUtil: number | null
  porDia: Map<number, EstadoDiaFlota>
}

export interface CalcDisponibilidadMes {
  diasDelMes: number
  diasPeriodo: number
  diasLaborales: number
  filas: FilaDisp[]
  flotaDisp: number | null
  flotaUtil: number | null
  camionesConParada: number
}

const pad = (n: number) => String(n).padStart(2, "0")

/** Unidades que rutean: **solo CAMIONES de distribución**.
 *
 *  Quedan afuera todo lo de depósito, los autoelevadores, los acoplados (no
 *  rutean solos, van remolcados) y las **camionetas**: son de supervisión y
 *  visita, no salen a repartir, así que mezclarlas en disponibilidad y
 *  utilización compara cosas distintas (Francisco, 07/08/2026).
 *
 *  El sector manda sobre el tipo: un alta nueva de depósito se excluye sola,
 *  sin tocar este código. */
export function flotaDeRuta(unidades: UnidadFlota[]): UnidadFlota[] {
  return unidades.filter(
    (u) =>
      u.sector !== "deposito" &&
      u.tipo !== "autoelevador" &&
      u.tipo !== "acoplado" &&
      u.tipo !== "camioneta"
  )
}

export function ruteoSetDe(diasRuteo: DiaRuteo[]): Set<string> {
  return new Set(diasRuteo.map((r) => `${r.dominio}|${r.fecha}`))
}

/** Una parada concreta: el tramo que sacó a la unidad de circulación. */
export interface ParadaFlota {
  desde: string
  hasta: string
  causa: "PMC" | "PMP" | "IND"
  motivo: string | null
  /** OT sin fecha de retorno: `hasta` es provisorio (se arrastra hasta hoy). */
  abierta: boolean
}

/**
 * Paradas por OT (con período) por dominio. Es la fuente de PMC/PMP tanto del
 * cálculo mensual como del detalle de un día: extraída para que el % y la lista
 * de camiones parados no puedan discrepar.
 */
export function paradasPorDominio(
  mantenimientos: MantenimientoRealizado[],
  hoy: string
): Map<string, ParadaFlota[]> {
  const paradas = new Map<string, ParadaFlota[]>()
  for (const m of mantenimientos) {
    if (!m.fuera_servicio_desde) continue
    // Una OT cancelada nunca sacó la unidad de servicio.
    if (m.estado === "cancelado") continue
    const arr = paradas.get(m.dominio) ?? []
    // Sin fecha de retorno: la parada se arrastra "hasta hoy" SOLO mientras
    // la OT sigue abierta. Una OT ya completada cierra en su propia fecha,
    // para no inflar indefinidamente los días de parada (PMC/PMP).
    const abierta = m.estado === "programado" || m.estado === "en_taller"
    const hasta = m.fuera_servicio_hasta || (abierta ? hoy : m.fecha)
    arr.push({
      desde: m.fuera_servicio_desde,
      hasta,
      causa: m.tipo === "correctivo" ? "PMC" : "PMP",
      motivo: m.observaciones ?? null,
      abierta: abierta && !m.fuera_servicio_hasta,
    })
    paradas.set(m.dominio, arr)
  }
  return paradas
}

/** Indisponibilidades (IND) por dominio: parada que no es de mantenimiento. */
export function indisponibilidadesPorDominio(
  indisponibilidades: FlotaIndisponibilidad[]
): Map<string, ParadaFlota[]> {
  const inds = new Map<string, ParadaFlota[]>()
  for (const i of indisponibilidades) {
    const arr = inds.get(i.dominio) ?? []
    arr.push({
      desde: i.fecha_desde,
      hasta: i.fecha_hasta,
      causa: "IND",
      motivo: i.motivo ?? null,
      abierta: false,
    })
    inds.set(i.dominio, arr)
  }
  return inds
}

/** Una unidad que no estaba disponible en una fecha, y por qué. */
export interface UnidadNoDisponible {
  dominio: string
  modelo: string | null
  anio: number | null
  causa: "PMC" | "PMP" | "IND"
  motivo: string | null
  desde: string
  /** null = la parada seguía abierta (OT sin fecha de retorno). */
  hasta: string | null
  /** Días que lleva parada al cierre de `fecha`, contando el día de inicio. */
  diasParada: number
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10))
  return Math.floor((b - a) / 86_400_000) + 1
}

/**
 * Unidades no disponibles en una fecha puntual, con el motivo de cada parada.
 * Usa la MISMA prioridad que el estado día a día del cálculo mensual
 * (ruteó > correctivo > preventivo > indisponible), así el detalle de un día
 * siempre coincide con lo que ese día aportó al % del mes.
 */
export function noDisponiblesEnFecha(
  fecha: string,
  flota: UnidadFlota[],
  mantenimientos: MantenimientoRealizado[],
  indisponibilidades: FlotaIndisponibilidad[],
  hoy: string,
  /** Días ruteados. Si se pasa, la unidad que ruteó ese día NO figura parada
   *  (misma regla que `calcularDisponibilidadMes`: el ruteo gana). */
  ruteoSet?: Set<string>
): UnidadNoDisponible[] {
  const paradas = paradasPorDominio(mantenimientos, hoy)
  const inds = indisponibilidadesPorDominio(indisponibilidades)

  const out: UnidadNoDisponible[] = []
  for (const u of flota) {
    if (ruteoSet?.has(`${u.dominio}|${fecha}`)) continue
    const cubre = (p: ParadaFlota) => fecha >= p.desde && fecha <= p.hasta
    const ps = (paradas.get(u.dominio) ?? []).filter(cubre)
    const is = (inds.get(u.dominio) ?? []).filter(cubre)
    // Misma prioridad que porDia: correctivo > preventivo > indisponible.
    const elegida =
      ps.find((p) => p.causa === "PMC") ?? ps.find((p) => p.causa === "PMP") ?? is[0]
    if (!elegida) continue
    out.push({
      dominio: u.dominio,
      modelo: u.modelo ?? null,
      anio: u.anio ?? null,
      causa: elegida.causa,
      motivo: elegida.motivo,
      desde: elegida.desde,
      hasta: elegida.abierta ? null : elegida.hasta,
      diasParada: diasEntre(elegida.desde, fecha),
    })
  }
  // Las paradas más largas primero: son las que hay que discutir en la reunión.
  return out.sort((a, b) => b.diasParada - a.diasParada || a.dominio.localeCompare(b.dominio))
}

/** Día siguiente a una fecha ISO, sin pasar por la zona horaria local. */
function diaSiguiente(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Estado día a día de cada unidad en un RANGO de fechas y agregados de flota.
 *
 * Es el núcleo del seguimiento: el mes, el año y el rango libre que elige el
 * usuario salen todos de acá, así que no puede pasar que el acumulado diga una
 * cosa y los meses otra. `flota` ya debe venir filtrada con flotaDeRuta();
 * `hoy` en ISO (YYYY-MM-DD).
 *
 * El rango se recorta a `hoy`: el futuro no se puede exigir —esos días todavía
 * no pasaron— y contarlo como "disponible" o "parado" sería inventar.
 */
export function calcularDisponibilidadRango(
  desde: string,
  hasta: string,
  flota: UnidadFlota[],
  mantenimientos: MantenimientoRealizado[],
  indisponibilidades: FlotaIndisponibilidad[],
  ruteoSet: Set<string>,
  hoy: string
): CalcDisponibilidadMes {
  const hastaEf = hasta > hoy ? hoy : hasta
  const fechas: string[] = []
  for (let f = desde; f <= hastaEf; f = diaSiguiente(f)) fechas.push(f)
  const diasPeriodo = fechas.length
  // El calendario día a día tiene por columnas los días del mes, así que sólo
  // se puede armar si el rango entero cae en un mismo mes. En un rango de
  // varios meses el número de día se repetiría y pintaría cualquier cosa.
  const unSoloMes = diasPeriodo > 0 && desde.slice(0, 7) === hastaEf.slice(0, 7)

  const paradas = paradasPorDominio(mantenimientos, hoy)
  const inds = indisponibilidadesPorDominio(indisponibilidades)

  // Días laborales = días con al menos un camión de la flota ruteado.
  // Los demás (domingos/feriados sin ruteo) NO cuentan para la utilización.
  const laboral = new Set<string>()
  for (const fecha of fechas) {
    for (const u of flota) {
      if (ruteoSet.has(`${u.dominio}|${fecha}`)) { laboral.add(fecha); break }
    }
  }

  const filas: FilaDisp[] = flota.map((u) => {
    const porDia = new Map<number, EstadoDiaFlota>()
    const ps = paradas.get(u.dominio) ?? []
    const is = inds.get(u.dominio) ?? []
    let pmc = 0, pmp = 0, ind = 0, drt = 0, dsp = 0, lib = 0
    for (const fecha of fechas) {
      // Prioridad: ruteó(DRT) > correctivo > preventivo > indisponible > disponible
      //
      // 🚨 El ruteo GANA sobre cualquier parada: si la unidad hizo su reparto
      // ese día, estuvo disponible ese día. Las tres causas de parada son
      // declarativas y ninguna tiene resolución horaria:
      //  - `fuera_servicio_desde/hasta` lo lleva TODA OT de taller (no mide
      //    gravedad), así que una OT de un solo día —soldar una guía, cambiar
      //    cubiertas— pintaba como parado un día en que el camión ruteó igual.
      //  - La IND documental la abre el cron de requisitos legales desde la
      //    fecha de vencimiento, sin saber si la unidad salió o no.
      // Contarlos hundía la disponibilidad con paradas que nunca existieron:
      // el AF028YB daba 73,1 % con 7 días parados sobre 26, y 4 de esos 7 los
      // ruteó completos.
      let est: EstadoDiaFlota | null = ruteoSet.has(`${u.dominio}|${fecha}`) ? "DRT" : null
      if (est == null) for (const p of ps) {
        if (fecha >= p.desde && fecha <= p.hasta) {
          if (p.causa === "PMC") { est = "PMC"; break }
          est = "PMP"
        }
      }
      if (est == null) {
        for (const i of is) {
          if (fecha >= i.desde && fecha <= i.hasta) { est = "IND"; break }
        }
      }
      if (est == null) est = laboral.has(fecha) ? "DSP" : "LIB" // LIB = día no laboral
      if (unSoloMes) porDia.set(Number(fecha.slice(8, 10)), est)

      if (est === "PMC") pmc++
      else if (est === "PMP") pmp++
      else if (est === "IND") ind++
      else if (est === "DRT") drt++
      else if (est === "DSP") dsp++
      else lib++
    }
    const parado = pmc + pmp + ind
    const disponibles = drt + dsp + lib
    const pctDisp = diasPeriodo > 0 ? (disponibles / diasPeriodo) * 100 : null
    // Utilización: solo sobre días laborales disponibles (DRT + DSP), sin contar LIB.
    const baseUtil = drt + dsp
    const pctUtil = baseUtil > 0 ? (drt / baseUtil) * 100 : null
    return {
      dominio: u.dominio, modelo: u.modelo ?? null, anio: u.anio ?? null,
      diasPeriodo, pmc, pmp, ind, drt, dsp, lib,
      parado, disponibles, pctDisp, pctUtil, porDia,
    }
  })

  const conDisp = filas.filter((f) => f.pctDisp != null)
  const flotaDisp = conDisp.length
    ? conDisp.reduce((a, f) => a + (f.pctDisp ?? 0), 0) / conDisp.length
    : null
  // Utilización de flota: solo sobre unidades EN SERVICIO en el período (las que
  // rutearon al menos un día). Las de reserva con 0 ruteos no diluyen el número.
  const enServicio = filas.filter((f) => f.drt > 0)
  const totBaseUtil = enServicio.reduce((a, f) => a + f.drt + f.dsp, 0)
  const totDrt = enServicio.reduce((a, f) => a + f.drt, 0)
  const flotaUtil = totBaseUtil > 0 ? (totDrt / totBaseUtil) * 100 : null

  return {
    // Las columnas del calendario son los días del MES, no los del período: un
    // rango del 10 al 20 se dibuja sobre octubre entero y los días de afuera se
    // pintan como "fuera del período". Con el rango cruzando meses no hay
    // calendario posible y el número no se usa.
    diasDelMes: unSoloMes
      ? new Date(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)), 0).getDate()
      : diasPeriodo,
    diasPeriodo,
    diasLaborales: laboral.size,
    filas,
    flotaDisp,
    flotaUtil,
    camionesConParada: filas.filter((f) => f.parado > 0).length,
  }
}

/**
 * Un mes: el rango va del día 1 al último día, cortado en hoy si es el mes en
 * curso. `diasDelMes` sigue siendo el largo del mes calendario y no el del
 * período, porque es lo que el calendario usa para dibujar las columnas (los
 * días que todavía no pasaron se pintan como "fuera del período").
 */
export function calcularDisponibilidadMes(
  mesSel: string,
  flota: UnidadFlota[],
  mantenimientos: MantenimientoRealizado[],
  indisponibilidades: FlotaIndisponibilidad[],
  ruteoSet: Set<string>,
  hoy: string
): CalcDisponibilidadMes {
  const [y, mm] = mesSel.split("-").map(Number)
  const diasDelMes = new Date(y, mm, 0).getDate()
  const calc = calcularDisponibilidadRango(
    `${mesSel}-01`,
    `${mesSel}-${pad(diasDelMes)}`,
    flota,
    mantenimientos,
    indisponibilidades,
    ruteoSet,
    hoy
  )
  return { ...calc, diasDelMes }
}

/**
 * Varios meses completos (el año): del día 1 del primero al último día del
 * último. Es el mismo rango, nombrado para los llamadores que piensan en meses.
 */
export function calcularDisponibilidadPeriodo(
  meses: string[],
  flota: UnidadFlota[],
  mantenimientos: MantenimientoRealizado[],
  indisponibilidades: FlotaIndisponibilidad[],
  ruteoSet: Set<string>,
  hoy: string
): CalcDisponibilidadMes {
  if (meses.length === 0) {
    return {
      diasDelMes: 0, diasPeriodo: 0, diasLaborales: 0, filas: [],
      flotaDisp: null, flotaUtil: null, camionesConParada: 0,
    }
  }
  const ordenados = [...meses].sort()
  const primero = ordenados[0]
  const ultimo = ordenados[ordenados.length - 1]
  const [uy, um] = ultimo.split("-").map(Number)
  return calcularDisponibilidadRango(
    `${primero}-01`,
    `${ultimo}-${pad(new Date(uy, um, 0).getDate())}`,
    flota,
    mantenimientos,
    indisponibilidades,
    ruteoSet,
    hoy
  )
}

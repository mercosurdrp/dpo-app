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

/** Unidades que rutean: solo flota de DISTRIBUCIÓN. Quedan afuera todo lo de
 *  depósito (autoelevadores y camionetas internas, que nunca salen a reparto y
 *  por lo tanto diluían la disponibilidad) y los acoplados (no rutean solos, van
 *  remolcados). El sector manda sobre el tipo: un alta nueva de depósito se
 *  excluye sola, sin tocar este código. */
export function flotaDeRuta(unidades: UnidadFlota[]): UnidadFlota[] {
  return unidades.filter(
    (u) =>
      u.sector !== "deposito" &&
      u.tipo !== "autoelevador" &&
      u.tipo !== "acoplado"
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
 * (correctivo > preventivo > indisponible), así el detalle de un día siempre
 * coincide con lo que ese día aportó al % del mes.
 */
export function noDisponiblesEnFecha(
  fecha: string,
  flota: UnidadFlota[],
  mantenimientos: MantenimientoRealizado[],
  indisponibilidades: FlotaIndisponibilidad[],
  hoy: string
): UnidadNoDisponible[] {
  const paradas = paradasPorDominio(mantenimientos, hoy)
  const inds = indisponibilidadesPorDominio(indisponibilidades)

  const out: UnidadNoDisponible[] = []
  for (const u of flota) {
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

/**
 * Estado día a día de cada unidad en un mes y agregados de flota.
 * `flota` ya debe venir filtrada con flotaDeRuta(); `hoy` en ISO (YYYY-MM-DD).
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
  const esMesActual = mesSel === hoy.slice(0, 7)
  const esFuturo = mesSel > hoy.slice(0, 7)
  const diasPeriodo = esFuturo ? 0 : esMesActual ? Number(hoy.slice(8, 10)) : diasDelMes

  const paradas = paradasPorDominio(mantenimientos, hoy)
  const inds = indisponibilidadesPorDominio(indisponibilidades)

  // Días laborales = días con al menos un camión de la flota ruteado.
  // Los demás (domingos/feriados sin ruteo) NO cuentan para la utilización.
  const laboral = new Set<number>()
  for (let d = 1; d <= diasPeriodo; d++) {
    const fecha = `${mesSel}-${pad(d)}`
    for (const u of flota) {
      if (ruteoSet.has(`${u.dominio}|${fecha}`)) { laboral.add(d); break }
    }
  }

  const filas: FilaDisp[] = flota.map((u) => {
    const porDia = new Map<number, EstadoDiaFlota>()
    const ps = paradas.get(u.dominio) ?? []
    const is = inds.get(u.dominio) ?? []
    for (let d = 1; d <= diasPeriodo; d++) {
      const fecha = `${mesSel}-${pad(d)}`
      // Prioridad: correctivo > preventivo > indisponible > ruteó(DRT) > disponible
      let est: EstadoDiaFlota | null = null
      for (const p of ps) {
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
      if (est == null) {
        if (ruteoSet.has(`${u.dominio}|${fecha}`)) est = "DRT"
        else est = laboral.has(d) ? "DSP" : "LIB" // LIB = día no laboral
      }
      porDia.set(d, est)
    }
    let pmc = 0, pmp = 0, ind = 0, drt = 0, dsp = 0, lib = 0
    for (const e of porDia.values()) {
      if (e === "PMC") pmc++
      else if (e === "PMP") pmp++
      else if (e === "IND") ind++
      else if (e === "DRT") drt++
      else if (e === "DSP") dsp++
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
  const diasLaborales = laboral.size
  const camionesConParada = filas.filter((f) => f.parado > 0).length

  return { diasDelMes, diasPeriodo, diasLaborales, filas, flotaDisp, flotaUtil, camionesConParada }
}

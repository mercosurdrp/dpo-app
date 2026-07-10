// Cálculo de disponibilidad y utilización de flota por mes.
// Extraído de seguimiento-flota.tsx para poder reusarlo en el tablero de
// indicadores (serie de varios meses) sin duplicar la lógica.

import type {
  DiaRuteo,
  FlotaIndisponibilidad,
  MantenimientoRealizado,
  VehiculoTipo,
} from "@/types/database"

// Objetivo histórico de disponibilidad de flota (planilla histórica: 98%).
export const TARGET_DISP = 98

export interface UnidadFlota {
  dominio: string
  tipo: VehiculoTipo | null
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

/** Unidades que rutean: excluye autoelevadores (se miden distinto) y acoplados
 *  (no rutean solos, van remolcados). */
export function flotaDeRuta(unidades: UnidadFlota[]): UnidadFlota[] {
  return unidades.filter((u) => u.tipo !== "autoelevador" && u.tipo !== "acoplado")
}

export function ruteoSetDe(diasRuteo: DiaRuteo[]): Set<string> {
  return new Set(diasRuteo.map((r) => `${r.dominio}|${r.fecha}`))
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

  // Paradas por OT (con período) por dominio.
  const paradas = new Map<string, { desde: string; hasta: string; causa: "PMC" | "PMP" }[]>()
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
    })
    paradas.set(m.dominio, arr)
  }
  // Indisponibilidades (IND) por dominio.
  const inds = new Map<string, { desde: string; hasta: string }[]>()
  for (const i of indisponibilidades) {
    const arr = inds.get(i.dominio) ?? []
    arr.push({ desde: i.fecha_desde, hasta: i.fecha_hasta })
    inds.set(i.dominio, arr)
  }

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

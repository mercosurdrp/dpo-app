/**
 * Asistencia a las capacitaciones — el indicador de presentismo, medido
 * capacitación por capacitación, con meta del 90 %.
 *
 * Definiciones (una sola por número, para que la pantalla, el Excel y la
 * auditoría digan lo mismo):
 *
 * - **Convocados**: los asistentes cargados en la capacitación. Es el
 *   denominador: a quién se citó.
 * - **Presentes**: los convocados marcados `presente`. Se marca a mano desde el
 *   detalle, y también solo cuando el empleado rinde el examen en la app.
 * - **Ausentes** = convocados − presentes.
 * - **Dictada**: capacitación no cancelada, con fecha ≤ hoy y al menos un
 *   convocado. Sin convocados no hay denominador y no se mide; las de fecha
 *   futura tampoco (todavía no se dictaron).
 * - **% de asistencia de una capacitación** = presentes / convocados.
 * - **Asistencia YTD** = Σ presentes / Σ convocados de las dictadas del año.
 *   Es el KPI global: pondera por tamaño, así que una capacitación de 40
 *   personas pesa más que una de 4.
 * - **En meta**: capacitación dictada cuyo % de asistencia llega al 90 %.
 *
 * El % se compara REDONDEADO, que es el que se ve en pantalla: si la tarjeta
 * dice "90 %" tiene que contar como en meta (44/49 = 89,8 % se muestra 90 %).
 */

/** Meta de asistencia: 90 %. */
export const META_ASISTENCIA = 0.9
export const META_ASISTENCIA_PCT = Math.round(META_ASISTENCIA * 100)

export interface ItemAsistencia {
  id: string
  titulo: string
  fecha: string
  pilar: string | null
  convocados: number
  presentes: number
  /** `cancelada` queda fuera de la medición. */
  estadoReal?: string
}

export interface CapacitacionAsistencia extends ItemAsistencia {
  ausentes: number
  /** presentes / convocados, 0-100. Null si no tiene convocados. */
  pct: number | null
  enMeta: boolean
}

export interface MesAsistencia {
  mes: number
  dictadas: number
  convocados: number
  presentes: number
  ausentes: number
  /** 0-100. Null si no hubo convocados en el mes. */
  pct: number | null
  /** Dictadas del mes que llegan a la meta. */
  enMeta: number
}

export interface PilarAsistencia {
  pilar: string
  dictadas: number
  convocados: number
  presentes: number
  ausentes: number
  pct: number | null
  enMeta: number
}

export interface Asistencia {
  anio: number
  /** Capacitaciones dictadas del año con al menos un convocado. */
  dictadas: number
  convocados: number
  presentes: number
  ausentes: number
  /** Σ presentes / Σ convocados, 0-100. Null si todavía no se convocó a nadie. */
  pctYtd: number | null
  /** Dictadas que llegan al 90 %. */
  enMeta: number
  /** enMeta / dictadas, 0-100. Cuántas capacitaciones cumplen la meta. */
  pctEnMeta: number | null
  /** Presencias que faltaron para que el YTD llegue al 90 %. */
  faltanParaMeta: number
  /** Dictadas por debajo de la meta, de la peor a la mejor. */
  bajoMeta: CapacitacionAsistencia[]
  /** Todas las dictadas, de la más nueva a la más vieja. */
  detalle: CapacitacionAsistencia[]
  porMes: MesAsistencia[]
  porPilar: PilarAsistencia[]
}

/** "Almacén" y "Almacen" conviven en la DB; se agrupan sin tildes. */
export function normalizePilar(pilar: string | null): string {
  return pilar ? pilar.normalize("NFD").replace(/[̀-ͯ]/g, "") : "Sin pilar"
}

const pct = (parte: number, total: number): number | null =>
  total > 0 ? Math.round((parte / total) * 100) : null

/** % de asistencia de una capacitación. Null si no tiene convocados. */
export function pctAsistencia(
  c: Pick<ItemAsistencia, "convocados" | "presentes">
): number | null {
  return pct(c.presentes, c.convocados)
}

/** Llega a la meta del 90 % (comparando el % redondeado que se ve en pantalla). */
export function enMetaAsistencia(
  c: Pick<ItemAsistencia, "convocados" | "presentes">
): boolean {
  const p = pctAsistencia(c)
  return p !== null && p >= META_ASISTENCIA_PCT
}

function enriquecer(c: ItemAsistencia): CapacitacionAsistencia {
  return {
    ...c,
    ausentes: Math.max(0, c.convocados - c.presentes),
    pct: pctAsistencia(c),
    enMeta: enMetaAsistencia(c),
  }
}

/** Dictada: no cancelada, fecha ≤ hoy, con al menos un convocado. */
export function esDictada(c: ItemAsistencia, today: string): boolean {
  return c.estadoReal !== "cancelada" && !!c.fecha && c.fecha <= today && c.convocados > 0
}

export function calcularAsistencia(
  items: ItemAsistencia[],
  today: string = new Date().toISOString().slice(0, 10)
): Asistencia {
  const anio = Number(today.slice(0, 4))

  const dictadas = items
    .filter((c) => c.fecha?.slice(0, 4) === String(anio) && esDictada(c, today))
    .map(enriquecer)

  const convocados = dictadas.reduce((s, c) => s + c.convocados, 0)
  const presentes = dictadas.reduce((s, c) => s + c.presentes, 0)
  const enMeta = dictadas.filter((c) => c.enMeta).length

  const porMes: MesAsistencia[] = []
  for (let m = 0; m < 12; m++) {
    const delMes = dictadas.filter((c) => Number(c.fecha.slice(5, 7)) - 1 === m)
    if (delMes.length === 0) continue
    const conv = delMes.reduce((s, c) => s + c.convocados, 0)
    const pres = delMes.reduce((s, c) => s + c.presentes, 0)
    porMes.push({
      mes: m,
      dictadas: delMes.length,
      convocados: conv,
      presentes: pres,
      ausentes: conv - pres,
      pct: pct(pres, conv),
      enMeta: delMes.filter((c) => c.enMeta).length,
    })
  }

  const pilares = new Set(dictadas.map((c) => normalizePilar(c.pilar)))
  const porPilar: PilarAsistencia[] = [...pilares]
    .map((pilar) => {
      const delPilar = dictadas.filter((c) => normalizePilar(c.pilar) === pilar)
      const conv = delPilar.reduce((s, c) => s + c.convocados, 0)
      const pres = delPilar.reduce((s, c) => s + c.presentes, 0)
      return {
        pilar,
        dictadas: delPilar.length,
        convocados: conv,
        presentes: pres,
        ausentes: conv - pres,
        pct: pct(pres, conv),
        enMeta: delPilar.filter((c) => c.enMeta).length,
      }
    })
    .sort((a, b) => b.convocados - a.convocados)

  return {
    anio,
    dictadas: dictadas.length,
    convocados,
    presentes,
    ausentes: convocados - presentes,
    pctYtd: pct(presentes, convocados),
    enMeta,
    pctEnMeta: pct(enMeta, dictadas.length),
    faltanParaMeta: Math.max(0, Math.ceil(META_ASISTENCIA * convocados) - presentes),
    bajoMeta: dictadas
      .filter((c) => !c.enMeta)
      .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.ausentes - a.ausentes),
    detalle: [...dictadas].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    porMes,
    porPilar,
  }
}

// ═══════════════════════════════════════════
// Asistencia por empleado
// ═══════════════════════════════════════════

export interface FilaAsistenciaEmpleado {
  empleadoId: string
  capacitacionId: string
  presente: boolean
  /** Resultado del examen. Sólo lo usa la adherencia por persona. */
  resultado?: "aprobado" | "desaprobado" | "pendiente" | null
}

export interface EmpleadoAsistencia {
  empleadoId: string
  nombre: string
  legajo: number | null
  sector: string | null
  /** A cuántas capacitaciones dictadas se lo convocó. */
  convocado: number
  presente: number
  ausente: number
  /** presente / convocado, 0-100. Null si nunca se lo convocó. */
  pct: number | null
  enMeta: boolean
  /** Las capacitaciones a las que faltó, de la más nueva a la más vieja. */
  ausencias: { id: string; titulo: string; fecha: string }[]
}

export interface EmpleadoRef {
  id: string
  nombre: string
  legajo: number | null
  sector: string | null
}

/**
 * Asistencia individual: de las capacitaciones **dictadas** a las que se
 * convocó a cada empleado, a cuántas asistió. Mismo universo que el KPI
 * general, así que los totales de las dos vistas cierran.
 *
 * Se ordena por la peor asistencia primero: la lista sirve para encontrar al
 * ausente crónico, no para premiar al que va siempre.
 */
export function asistenciaPorEmpleado(
  filas: FilaAsistenciaEmpleado[],
  empleados: EmpleadoRef[],
  capacitaciones: ItemAsistencia[],
  today: string = new Date().toISOString().slice(0, 10)
): EmpleadoAsistencia[] {
  const anio = Number(today.slice(0, 4))
  const dictadas = new Map<string, ItemAsistencia>()
  for (const c of capacitaciones) {
    if (c.fecha?.slice(0, 4) === String(anio) && esDictada(c, today)) dictadas.set(c.id, c)
  }

  const porEmpleado = new Map<string, EmpleadoAsistencia>()
  const refs = new Map(empleados.map((e) => [e.id, e]))

  for (const f of filas) {
    const cap = dictadas.get(f.capacitacionId)
    if (!cap) continue
    const ref = refs.get(f.empleadoId)
    const acc =
      porEmpleado.get(f.empleadoId) ??
      ({
        empleadoId: f.empleadoId,
        nombre: ref?.nombre ?? "Sin nombre",
        legajo: ref?.legajo ?? null,
        sector: ref?.sector ?? null,
        convocado: 0,
        presente: 0,
        ausente: 0,
        pct: null,
        enMeta: false,
        ausencias: [],
      } satisfies EmpleadoAsistencia)
    acc.convocado++
    if (f.presente) acc.presente++
    else {
      acc.ausente++
      acc.ausencias.push({ id: cap.id, titulo: cap.titulo, fecha: cap.fecha })
    }
    porEmpleado.set(f.empleadoId, acc)
  }

  return [...porEmpleado.values()]
    .map((e) => ({
      ...e,
      pct: pct(e.presente, e.convocado),
      enMeta: (pct(e.presente, e.convocado) ?? 0) >= META_ASISTENCIA_PCT,
      ausencias: e.ausencias.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    }))
    .sort(
      (a, b) =>
        (a.pct ?? 0) - (b.pct ?? 0) ||
        b.ausente - a.ausente ||
        a.nombre.localeCompare(b.nombre)
    )
}

// ═══════════════════════════════════════════
// Adherencia por persona
// ═══════════════════════════════════════════

export interface PilarPersona {
  pilar: string
  convocado: number
  aprobado: number
  /** aprobado / convocado, 0-100. */
  pct: number | null
}

export interface PersonaAdherencia {
  empleadoId: string
  nombre: string
  legajo: number | null
  sector: string | null
  /** Capacitaciones dictadas a las que se lo convocó. */
  convocado: number
  asistio: number
  falto: number
  /** Rindió el examen (aprobado o desaprobado). */
  rindio: number
  aprobado: number
  desaprobado: number
  /** Convocado, sin examen rendido todavía. */
  pendiente: number
  /** asistio / convocado, 0-100. */
  pctAsistencia: number | null
  /**
   * aprobado / convocado, 0-100. Es la adherencia individual: de todo lo que
   * le tocaba, cuánto completó de verdad.
   */
  pctAdherencia: number | null
  enMetaAsistencia: boolean
  enMetaAdherencia: boolean
  porPilar: PilarPersona[]
}

/**
 * Adherencia por persona: de las capacitaciones **dictadas** a las que se
 * convocó a cada empleado, cuántas completó (aprobó el examen).
 *
 * Es el mismo criterio con el que el módulo da una capacitación por cumplida
 * —la define el % de aprobados—, pero mirado por persona en vez de por
 * capacitación. Convive con la asistencia: se puede ir a la charla y no rendir,
 * y ahí la asistencia da bien y la adherencia no.
 *
 * Mismo universo que el resto del panel (dictadas del año), así que los totales
 * de las dos vistas cierran.
 */
export function adherenciaPorPersona(
  filas: FilaAsistenciaEmpleado[],
  empleados: EmpleadoRef[],
  capacitaciones: ItemAsistencia[],
  today: string = new Date().toISOString().slice(0, 10)
): PersonaAdherencia[] {
  const anio = Number(today.slice(0, 4))
  const dictadas = new Map<string, ItemAsistencia>()
  for (const c of capacitaciones) {
    if (c.fecha?.slice(0, 4) === String(anio) && esDictada(c, today)) dictadas.set(c.id, c)
  }

  const refs = new Map(empleados.map((e) => [e.id, e]))
  const acc = new Map<string, PersonaAdherencia & { pilares: Map<string, PilarPersona> }>()

  for (const f of filas) {
    const cap = dictadas.get(f.capacitacionId)
    if (!cap) continue
    const ref = refs.get(f.empleadoId)
    const p =
      acc.get(f.empleadoId) ??
      {
        empleadoId: f.empleadoId,
        nombre: ref?.nombre ?? "Sin nombre",
        legajo: ref?.legajo ?? null,
        sector: ref?.sector ?? null,
        convocado: 0,
        asistio: 0,
        falto: 0,
        rindio: 0,
        aprobado: 0,
        desaprobado: 0,
        pendiente: 0,
        pctAsistencia: null,
        pctAdherencia: null,
        enMetaAsistencia: false,
        enMetaAdherencia: false,
        porPilar: [],
        pilares: new Map<string, PilarPersona>(),
      }

    p.convocado++
    if (f.presente) p.asistio++
    else p.falto++
    if (f.resultado === "aprobado") {
      p.aprobado++
      p.rindio++
    } else if (f.resultado === "desaprobado") {
      p.desaprobado++
      p.rindio++
    } else {
      p.pendiente++
    }

    const pilar = normalizePilar(cap.pilar)
    const acu = p.pilares.get(pilar) ?? { pilar, convocado: 0, aprobado: 0, pct: null }
    acu.convocado++
    if (f.resultado === "aprobado") acu.aprobado++
    p.pilares.set(pilar, acu)

    acc.set(f.empleadoId, p)
  }

  return [...acc.values()]
    .map(({ pilares, ...p }) => {
      const pctAsist = pct(p.asistio, p.convocado)
      const pctAdh = pct(p.aprobado, p.convocado)
      return {
        ...p,
        pctAsistencia: pctAsist,
        pctAdherencia: pctAdh,
        enMetaAsistencia: (pctAsist ?? 0) >= META_ASISTENCIA_PCT,
        enMetaAdherencia: (pctAdh ?? 0) >= META_ASISTENCIA_PCT,
        porPilar: [...pilares.values()]
          .map((x) => ({ ...x, pct: pct(x.aprobado, x.convocado) }))
          .sort((a, b) => a.pilar.localeCompare(b.pilar)),
      }
    })
    .sort(
      (a, b) =>
        (a.pctAdherencia ?? 0) - (b.pctAdherencia ?? 0) ||
        b.convocado - a.convocado ||
        a.nombre.localeCompare(b.nombre)
    )
}

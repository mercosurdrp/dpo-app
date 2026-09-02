import { HAY_PAC, META_CUMPLIMIENTO, PAC_2026, pacDelMes, pacDelPilar } from "@/lib/pac-2026"
import type { EstadoCapacitacion } from "@/types/database"

/**
 * Adherencia al cronograma de capacitaciones ("el Gantt").
 *
 * Definiciones (una sola por número, para que la pantalla, el Excel del PAC y la
 * auditoría digan lo mismo):
 *
 * - **Calendarizada**: capacitación cargada en el año, sin cancelar.
 * - **Vencida**: calendarizada cuya fecha ya pasó (fecha ≤ hoy).
 * - **Cumplida**: estado derivado `completada` (todos los asistentes rindieron).
 *   Una capacitación vencida que sigue `en curso` NO cuenta como cumplida.
 * - **Adherencia YTD** = cumplidas vencidas / vencidas. Es el KPI del Gantt: mide
 *   si se dictó lo que ya tenía que estar dictado.
 * - **Cumplimiento anual** = cumplidas / calendarizadas del año. Contra este número
 *   se mide la meta del 90 % a fin de año.
 * - **Atrasada** = vencida y no cumplida.
 */

export interface ItemAdherencia {
  id: string
  titulo: string
  fecha: string
  pilar: string | null
  estadoReal: EstadoCapacitacion
  /** El estado lo puso una persona (curso externo), no el avance. */
  estadoManual?: boolean
}

export interface MesAdherencia {
  mes: number
  calendarizadas: number
  vencidas: number
  /** Cumplidas de las vencidas: el numerador de la adherencia. */
  cumplidas: number
  /** Cumplidas antes de su fecha (todavía no vencidas). No entran en la adherencia. */
  adelantadas: number
  atrasadas: number
  adherencia: number | null
  pac: number
}

export interface PilarAdherencia {
  pilar: string
  calendarizadas: number
  vencidas: number
  /** Cumplidas de las vencidas: el numerador de la adherencia. */
  cumplidas: number
  /** Cumplidas antes de su fecha (todavía no vencidas). No entran en la adherencia. */
  adelantadas: number
  atrasadas: number
  adherencia: number | null
  pac: number
}

export interface Adherencia {
  anio: number
  /** Calendarizadas del año (excluye canceladas). */
  totalAnual: number
  cumplidasAnual: number
  /** cumplidas / calendarizadas del año, 0-100. */
  cumplimientoAnual: number
  vencidas: number
  cumplidasVencidas: number
  /** cumplidas vencidas / vencidas, 0-100. Null si todavía no venció ninguna. */
  adherenciaYtd: number | null
  atrasadas: ItemAdherencia[]
  /** De las cumplidas del año, cuántas tienen el estado cargado a mano. */
  cumplidasManuales: number
  /** Cuántas hay que tener cumplidas a fin de año para llegar a la meta. */
  metaCantidad: number
  /** Cuántas faltan cumplir para llegar a la meta. */
  faltanParaMeta: number
  /** Pendientes (no cumplidas) menos las que faltan: cuántas se pueden caer sin perder la meta. */
  margen: number
  /** Meses que quedan del año, contando el actual. */
  mesesRestantes: number
  /** Último mes con capacitaciones calendarizadas (0-11): el horizonte real del Gantt. */
  ultimoMesCalendarizado: number
  /** Meses que quedan hasta el final del cronograma, contando el actual. */
  mesesHastaFinCronograma: number
  /** Capacitaciones a cerrar por mes para llegar a la meta antes de que termine el cronograma. */
  ritmoRequerido: number
  porMes: MesAdherencia[]
  porPilar: PilarAdherencia[]
  /** Meses ya cerrados: hasta ahí la comparación contra el PAC es de mes completo. */
  ultimoMesCerrado: number
  pacYtd: number
  calendarizadasHastaMesCerrado: number
  cumplidasHastaMesCerrado: number
}

/** "Almacén" y "Almacen" conviven en la DB; se agrupan sin tildes. */
export function normalizePilar(pilar: string | null): string {
  return pilar ? pilar.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "Sin pilar"
}

const pct = (parte: number, total: number): number | null =>
  total > 0 ? Math.round((parte / total) * 100) : null

export function calcularAdherencia(
  items: ItemAdherencia[],
  today: string = new Date().toISOString().slice(0, 10)
): Adherencia {
  const anio = Number(today.slice(0, 4))
  const mesActual = Number(today.slice(5, 7)) - 1

  const delAnio = items.filter(
    (c) => c.fecha?.slice(0, 4) === String(anio) && c.estadoReal !== "cancelada"
  )
  const vencidasList = delAnio.filter((c) => c.fecha <= today)
  const cumplidasVencidas = vencidasList.filter((c) => c.estadoReal === "completada")
  const atrasadas = vencidasList
    .filter((c) => c.estadoReal !== "completada")
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const totalAnual = delAnio.length
  const cumplidasAnual = delAnio.filter((c) => c.estadoReal === "completada").length
  const cumplidasManuales = delAnio.filter(
    (c) => c.estadoReal === "completada" && c.estadoManual
  ).length
  const metaCantidad = Math.ceil(totalAnual * META_CUMPLIMIENTO)
  const faltanParaMeta = Math.max(0, metaCantidad - cumplidasAnual)
  const pendientes = totalAnual - cumplidasAnual
  const mesesRestantes = 12 - mesActual
  const ultimoMesCalendarizado = delAnio.reduce(
    (max, c) => Math.max(max, Number(c.fecha.slice(5, 7)) - 1),
    mesActual
  )
  const mesesHastaFinCronograma = Math.max(1, ultimoMesCalendarizado - mesActual + 1)

  const porMes: MesAdherencia[] = []
  for (let m = 0; m < 12; m++) {
    const delMes = delAnio.filter((c) => Number(c.fecha.slice(5, 7)) - 1 === m)
    const venc = delMes.filter((c) => c.fecha <= today)
    const cump = venc.filter((c) => c.estadoReal === "completada").length
    const pac = pacDelMes(m)
    if (delMes.length === 0 && pac === 0) continue
    porMes.push({
      mes: m,
      calendarizadas: delMes.length,
      vencidas: venc.length,
      cumplidas: cump,
      adelantadas: delMes.filter((c) => c.estadoReal === "completada").length - cump,
      atrasadas: venc.length - cump,
      adherencia: pct(cump, venc.length),
      pac,
    })
  }

  const pilares = new Set<string>([
    ...delAnio.map((c) => normalizePilar(c.pilar)),
    ...(HAY_PAC ? Object.keys(PAC_2026) : []),
  ])
  const porPilar: PilarAdherencia[] = [...pilares]
    .map((pilar) => {
      const delPilar = delAnio.filter((c) => normalizePilar(c.pilar) === pilar)
      const venc = delPilar.filter((c) => c.fecha <= today)
      const cump = venc.filter((c) => c.estadoReal === "completada").length
      return {
        pilar,
        calendarizadas: delPilar.length,
        vencidas: venc.length,
        cumplidas: cump,
        adelantadas: delPilar.filter((c) => c.estadoReal === "completada").length - cump,
        atrasadas: venc.length - cump,
        adherencia: pct(cump, venc.length),
        pac: pacDelPilar(pilar),
      }
    })
    .filter((p) => p.calendarizadas > 0 || p.pac > 0)
    .sort((a, b) => b.calendarizadas - a.calendarizadas)

  // Comparación contra el PAC: el PAC planifica por mes, no por día, así que sólo es
  // comparable sobre meses ya cerrados.
  const ultimoMesCerrado = mesActual - 1
  const hastaMesCerrado = delAnio.filter(
    (c) => Number(c.fecha.slice(5, 7)) - 1 <= ultimoMesCerrado
  )
  let pacYtd = 0
  for (let m = 0; m <= ultimoMesCerrado; m++) pacYtd += pacDelMes(m)

  return {
    anio,
    totalAnual,
    cumplidasAnual,
    cumplimientoAnual: pct(cumplidasAnual, totalAnual) ?? 0,
    vencidas: vencidasList.length,
    cumplidasVencidas: cumplidasVencidas.length,
    adherenciaYtd: pct(cumplidasVencidas.length, vencidasList.length),
    atrasadas,
    cumplidasManuales,
    metaCantidad,
    faltanParaMeta,
    margen: pendientes - faltanParaMeta,
    mesesRestantes,
    ultimoMesCalendarizado,
    mesesHastaFinCronograma,
    ritmoRequerido: Math.ceil(faltanParaMeta / mesesHastaFinCronograma),
    porMes,
    porPilar,
    ultimoMesCerrado,
    pacYtd,
    calendarizadasHastaMesCerrado: hastaMesCerrado.length,
    cumplidasHastaMesCerrado: hastaMesCerrado.filter((c) => c.estadoReal === "completada").length,
  }
}

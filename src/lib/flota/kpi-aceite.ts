/**
 * KPIs de aceite del DPO Flota 4.1 (ATO / CIL), cálculo puro.
 *
 *  - `cil_fugas_detectadas` (PI de ATO, R4.1.4): hallazgos del control de
 *    aceite del CIL — nivel fuera de rango, litros repuestos o pérdida a la
 *    vista. Es lo que el operador encuentra ANTES de que llegue a ruta.
 *  - `fugas_aceite_ruta` (resultado): eventos de pérdida que sí llegaron al
 *    checklist diario. Si el CIL funciona, esto baja.
 *
 * 🚨 Lo usan `getFlotaKpiSeriesExtra` (la tarjeta) y `getFlotaKpiDetalle` (las
 * filas detrás del número): si cada uno calculara a su manera, el detalle
 * dejaría de explicar la tarjeta.
 */

import { esHallazgoAceite } from "@/lib/flota/cil-aceite"

/**
 * Ítems del checklist que cuentan como pérdida de aceite en ruta: «Pérdida de
 * fluidos y/o alarmas» (camión y autoelevador) y «Nivel de aceite motor».
 * Se identifican por nombre, igual que `FAMILIAS_DEFECTO_CIL`.
 */
export function esItemAceiteChecklist(nombre: string): boolean {
  return /p[ée]rdida de fluidos/i.test(nombre) || /nivel de aceite/i.test(nombre)
}

/**
 * Días sin reporte de la misma unidad a partir de los cuales una pérdida nueva
 * es OTRO evento.
 *
 * 🚨 Sin agrupar, julio de 2026 contaba 16: era la MISMA pérdida hidráulica del
 * HELI1 re-marcada en cada checklist hasta que se cambió la tapa (04/08). El
 * PI cuenta fugas, no checklists. 7 días cubren el fin de semana y los días
 * en que el equipo no se usó sin juntar dos fugas distintas del mismo mes.
 */
export const DIAS_MISMO_EVENTO = 7

export interface ReporteAceite {
  fecha: string
  dominio: string
  item: string
  valor: string
  comentario: string | null
}

export interface EventoFuga {
  dominio: string
  /** Primer reporte: el mes del evento es el de esta fecha. */
  desde: string
  hasta: string
  reportes: number
  items: string[]
  comentario: string | null
}

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Agrupa los reportes en eventos por unidad. Entrada en cualquier orden. */
export function eventosFuga(reportes: ReporteAceite[]): EventoFuga[] {
  const orden = [...reportes].sort(
    (a, b) => a.dominio.localeCompare(b.dominio) || a.fecha.localeCompare(b.fecha),
  )
  const eventos: EventoFuga[] = []
  let actual: EventoFuga | null = null
  for (const r of orden) {
    const fecha = r.fecha.slice(0, 10)
    if (actual && actual.dominio === r.dominio && diasEntre(actual.hasta, fecha) <= DIAS_MISMO_EVENTO) {
      actual.hasta = fecha
      actual.reportes++
      if (!actual.items.includes(r.item)) actual.items.push(r.item)
      if (!actual.comentario && r.comentario?.trim()) actual.comentario = r.comentario.trim()
      continue
    }
    actual = {
      dominio: r.dominio,
      desde: fecha,
      hasta: fecha,
      reportes: 1,
      items: [r.item],
      comentario: r.comentario?.trim() || null,
    }
    eventos.push(actual)
  }
  return eventos.sort((a, b) => a.desde.localeCompare(b.desde))
}

export interface FilaCilAceite {
  id?: string
  fecha: string
  dominio: string
  aceite_nivel: string | null
  aceite_litros: number | string | null
  aceite_circuito?: string | null
  perdida_detectada: boolean | null
  perdida_ubicacion?: string | null
  mantenimiento_id?: string | null
}

/** Controles de aceite cargados (con resultado) y cuáles son hallazgos. */
export function controlesAceite(filas: FilaCilAceite[]) {
  const controles = filas.filter((f) => f.aceite_nivel != null || f.perdida_detectada != null)
  return { controles, hallazgos: controles.filter(esHallazgoAceite) }
}

/**
 * Hallazgos repetidos: la misma unidad repone aceite o pierde en dos meses
 * distintos dentro de los últimos tres. Es el disparador del 5 Porqués
 * (caso real: AE591EI, ago y sep 2026).
 */
export function dominiosReincidentes(hallazgos: FilaCilAceite[]): Set<string> {
  const meses = new Map<string, Set<string>>()
  for (const h of hallazgos) {
    const set = meses.get(h.dominio) ?? new Set<string>()
    set.add(h.fecha.slice(0, 7))
    meses.set(h.dominio, set)
  }
  return new Set([...meses].filter(([, s]) => s.size >= 2).map(([d]) => d))
}

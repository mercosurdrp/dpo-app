// Proyección del plan preventivo a fechas de calendario (DPO 2.2, R2.2.3).
//
// El plan no tiene fechas: cada tarea vence por tiempo, por kilómetros o por
// horas de horómetro. Para poder mostrarlo en un calendario hay que llevar los
// tres ejes a una fecha:
//
//   · tiempo → la fecha ya está calculada (`proximaFecha`), es CIERTA.
//   · km / horas → se estima con el ritmo de uso de cada unidad (km por día de
//     los últimos días con lectura). Es una ESTIMACIÓN y se marca como tal: si
//     el camión rueda más, la fecha se adelanta sola.
//
// Cuando una tarea tiene varios ejes vale el que ocurra primero, igual que en
// `computeCelda` de `lib/vehiculos/plan-mantenimiento`.

import type { EstadoPlanVehiculo, MantenimientoPlanTarea } from "@/types/database"

/** Lectura de odómetro (en autoelevadores, de horómetro) ya agrupada por día. */
export interface LecturaDia {
  fecha: string
  odometro: number
}

export type EjeVencimiento = "tiempo" | "km" | "horas"

/**
 * El service general proyectado que ya muestra el Tablero operativo
 * (`ServiceGeneralUnidad`). El calendario lo toma tal cual: si el tablero dice
 * "faltan 8 días", en el calendario cae ese mismo día. Un solo cálculo.
 */
export interface ServiceProyectado {
  dominio: string
  proximaFecha: string | null
  diasRestantes: number | null
  kmDia: number | null
  /** Qué disparó la proyección en el tablero: km, horas o el plazo en meses. */
  motivo: "km" | "horas" | "tiempo" | null
  /** Lo que falta para el corte, en km o en horas. */
  kmRestante: number | null
  mide: "km" | "horas"
}

/** Código de la tarea del plan que ES el service general: lo aporta el tablero. */
const CODIGO_SERVICE = "service"

export interface EventoPreventivo {
  /** Fecha ISO en la que la tarea vence (real si es por tiempo, estimada si es por uso). */
  fecha: string
  dominio: string
  tareaId: string
  tarea: string
  estado: "vencido" | "proximo" | "ok"
  eje: EjeVencimiento
  /** true cuando la fecha se dedujo del ritmo de uso y no de un plazo. */
  estimada: boolean
  /** Lo que falta para el vencimiento, en las unidades del eje. */
  detalle: string | null
}

/** Días mínimos de historial para que el ritmo de uso sea creíble. */
const MIN_DIAS_RITMO = 7
/** Tope de la proyección: más allá de un año la estimación no dice nada. */
const MAX_DIAS_PROYECCION = 400
/**
 * Techos de cordura del ritmo. Un dígito de más en una lectura de odómetro
 * (57.000 tecleado como 570.000) daría un ritmo enorme y pondría a toda la
 * flota venciendo mañana: es preferible no estimar a estimar cualquier cosa.
 */
const MAX_KM_DIA = 1000
const MAX_HORAS_DIA = 24

const pad = (n: number) => String(n).padStart(2, "0")

export function isoDe(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDiasIso(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return isoDe(d)
}

export function diasEntre(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Ritmo de uso por unidad (km/día, o horas/día en autoelevadores) a partir del
 * historial de lecturas. Sin al menos `MIN_DIAS_RITMO` días de historial no
 * devuelve nada: estimar con dos lecturas del mismo día da fechas absurdas.
 */
export function ritmoDiarioPorDominio(
  historial: Record<string, LecturaDia[]>,
  /** Tipo de cada unidad: en los autoelevadores la lectura son horas, no km. */
  tiposPorDominio?: Map<string, string | null>
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [dominio, lecturas] of Object.entries(historial)) {
    if (!lecturas || lecturas.length < 2) continue
    const ordenadas = [...lecturas].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    const primera = ordenadas[0]
    const ultima = ordenadas[ordenadas.length - 1]
    const dias = diasEntre(primera.fecha, ultima.fecha)
    const delta = ultima.odometro - primera.odometro
    if (dias < MIN_DIAS_RITMO || delta <= 0) continue
    const ritmo = delta / dias
    const tope = tiposPorDominio?.get(dominio) === "autoelevador" ? MAX_HORAS_DIA : MAX_KM_DIA
    if (ritmo > tope) continue
    out.set(dominio, ritmo)
  }
  return out
}

const fmtNum = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n))

/**
 * Convierte el estado del plan en eventos con fecha. Una tarea genera un solo
 * evento: el del eje que vence primero.
 *
 * Las tareas `sin_datos` (nunca se les hizo el mantenimiento) no entran: no hay
 * desde cuándo contar, y ponerlas en una fecha inventada ensucia el calendario.
 */
export function eventosPreventivos(params: {
  estados: EstadoPlanVehiculo[]
  tareasById: Map<string, MantenimientoPlanTarea>
  ritmoPorDominio: Map<string, number>
  /** Service general por unidad, tal como lo proyecta el Tablero operativo. */
  servicePorDominio?: Map<string, ServiceProyectado>
  hoy: string
}): EventoPreventivo[] {
  const { estados, tareasById, ritmoPorDominio, servicePorDominio, hoy } = params
  const eventos: EventoPreventivo[] = []

  for (const e of estados) {
    const dominio = e.vehiculo.dominio
    const service = servicePorDominio?.get(dominio)
    // La tasa del tablero manda: si el calendario midiera por su cuenta, el
    // mismo service caería en dos días distintos según dónde se lo mire.
    const ritmo = service?.kmDia && service.kmDia > 0
      ? service.kmDia
      : ritmoPorDominio.get(dominio) ?? null

    // El service general lo aporta el tablero, con su fecha y su semáforo.
    if (service?.proximaFecha) {
      const dias = service.diasRestantes
      const unidad = service.mide === "horas" ? "hs" : "km"
      eventos.push({
        fecha: service.proximaFecha,
        dominio,
        tareaId: `service:${dominio}`,
        tarea: "Service general",
        estado: dias == null ? "ok" : dias < 0 ? "vencido" : dias <= 15 ? "proximo" : "ok",
        eje: service.motivo === "tiempo" ? "tiempo" : service.motivo === "horas" ? "horas" : "km",
        estimada: service.motivo !== "tiempo",
        detalle:
          service.kmRestante != null
            ? service.kmRestante >= 0
              ? `faltan ${fmtNum(service.kmRestante)} ${unidad}`
              : `${fmtNum(-service.kmRestante)} ${unidad} pasado`
            : dias != null
              ? dias >= 0
                ? `faltan ${dias} días`
                : `vencido hace ${-dias} días`
              : null,
      })
    }

    for (const c of e.celdas) {
      if (c.estado === "sin_datos") continue
      const tarea = tareasById.get(c.tareaId)
      if (!tarea) continue
      // No duplicar: el service ya entró con la fecha del tablero.
      if (service?.proximaFecha && tarea.codigo === CODIGO_SERVICE) continue

      const candidatos: { fecha: string; eje: EjeVencimiento; estimada: boolean; detalle: string | null }[] =
        []

      if (c.proximaFecha) {
        const faltan = diasEntre(hoy, c.proximaFecha)
        candidatos.push({
          fecha: c.proximaFecha,
          eje: "tiempo",
          estimada: false,
          detalle: faltan >= 0 ? `faltan ${faltan} días` : `vencido hace ${-faltan} días`,
        })
      }

      // Ejes de uso: se proyectan sólo si hay lectura actual y ritmo conocido.
      const porUso = (
        objetivo: number | null,
        actual: number | null,
        eje: "km" | "horas",
        unidad: string
      ) => {
        if (objetivo == null || actual == null || !ritmo || ritmo <= 0) return
        const restante = objetivo - actual
        if (restante <= 0) {
          candidatos.push({
            fecha: hoy,
            eje,
            estimada: true,
            detalle: `${fmtNum(-restante)} ${unidad} pasado`,
          })
          return
        }
        const dias = Math.ceil(restante / ritmo)
        if (dias > MAX_DIAS_PROYECCION) return
        candidatos.push({
          fecha: addDiasIso(hoy, dias),
          eje,
          estimada: true,
          detalle: `faltan ${fmtNum(restante)} ${unidad}`,
        })
      }

      porUso(c.proximoKm, e.kmActual, "km", "km")
      porUso(c.proximasHoras, e.horasActuales, "horas", "hs")

      if (candidatos.length === 0) continue
      candidatos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
      const elegido = candidatos[0]

      eventos.push({
        fecha: elegido.fecha,
        dominio,
        tareaId: c.tareaId,
        tarea: tarea.nombre,
        estado: c.estado === "vencido" ? "vencido" : c.estado === "proximo" ? "proximo" : "ok",
        eje: elegido.eje,
        estimada: elegido.estimada,
        detalle: elegido.detalle,
      })
    }
  }

  return eventos.sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.dominio.localeCompare(b.dominio)
  )
}

/** Agrupa los eventos por fecha para pintarlos en la grilla del mes. */
export function eventosPorFecha(eventos: EventoPreventivo[]): Map<string, EventoPreventivo[]> {
  const map = new Map<string, EventoPreventivo[]>()
  for (const ev of eventos) {
    const arr = map.get(ev.fecha)
    if (arr) arr.push(ev)
    else map.set(ev.fecha, [ev])
  }
  return map
}

/** Días (lunes a domingo) de la grilla que contiene al mes de `ancla`. */
export function grillaMes(ancla: string): { dias: string[]; primeroDelMes: string; ultimoDelMes: string } {
  const [y, m] = ancla.split("-").map(Number)
  const primero = new Date(y, m - 1, 1)
  const ultimo = new Date(y, m, 0)
  const offsetInicio = (primero.getDay() + 6) % 7 // 0 = lunes
  const inicio = new Date(primero)
  inicio.setDate(inicio.getDate() - offsetInicio)
  const offsetFin = (7 - ((ultimo.getDay() + 6) % 7) - 1 + 7) % 7
  const fin = new Date(ultimo)
  fin.setDate(fin.getDate() + offsetFin)

  const dias: string[] = []
  for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
    dias.push(isoDe(d))
  }
  return { dias, primeroDelMes: isoDe(primero), ultimoDelMes: isoDe(ultimo) }
}

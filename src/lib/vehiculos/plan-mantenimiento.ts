import { createClient } from "@/lib/supabase/server"
import {
  addMonths,
  daysBetween,
  fetchLecturas,
  kmActualPorDominio,
  today,
} from "@/lib/vehiculos/lecturas"
import type {
  AlertaVehiculo,
  CatalogoVehiculo,
  EstadoPlanCelda,
  EstadoPlanVehiculo,
  EstadoTareaMantenimiento,
  MantenimientoPlanOverride,
  MantenimientoPlanTarea,
} from "@/types/database"

// Lógica pura del estado del plan de mantenimiento (sin Supabase) para que la
// compartan getEstadoPlanFlota y getAlertasVehiculos.
//
// El próximo vencimiento se deriva del último mantenimiento COMPLETADO que
// incluyó la tarea + la frecuencia efectiva (override ?? plantilla), comparado
// contra el km/horas actuales y la fecha de hoy. Vence el eje que ocurra
// primero. Umbral "próximo": ≥90% de la frecuencia consumida, o ≤1.000 km /
// ≤15 días restantes.

export interface UltimoRealizadoPorTarea {
  fecha: string
  odometro: number | null
  horometro: number | null
}

export interface LecturaActual {
  kmActual: number | null
  horasActuales: number | null
}

const PROXIMO_PCT = 0.9
const PROXIMO_KM = 1000
const PROXIMO_DIAS = 15

function peor(a: EstadoTareaMantenimiento, b: EstadoTareaMantenimiento): EstadoTareaMantenimiento {
  const orden: Record<EstadoTareaMantenimiento, number> = {
    vencido: 3,
    proximo: 2,
    ok: 1,
    sin_datos: 0,
  }
  return orden[a] >= orden[b] ? a : b
}

function computeCelda(
  tarea: MantenimientoPlanTarea,
  override: MantenimientoPlanOverride | undefined,
  ultimo: UltimoRealizadoPorTarea | undefined,
  actual: LecturaActual,
  hoy: string
): EstadoPlanCelda {
  const frecKm = override?.frecuencia_km ?? tarea.frecuencia_km
  const frecMeses = override?.frecuencia_meses ?? tarea.frecuencia_meses
  const frecHoras = override?.frecuencia_horas ?? tarea.frecuencia_horas

  const celda: EstadoPlanCelda = {
    tareaId: tarea.id,
    estado: "sin_datos",
    ultimaFecha: ultimo?.fecha ?? null,
    ultimoOdometro: ultimo?.odometro ?? null,
    ultimoHorometro: ultimo?.horometro ?? null,
    proximoKm: null,
    proximaFecha: null,
    proximasHoras: null,
    pctConsumido: null,
    soloPorTiempo: false,
  }

  if (!ultimo) return celda

  let estado: EstadoTareaMantenimiento = "ok"
  let pctMax: number | null = null
  let ejeKmEvaluado = false
  let ejeHorasEvaluado = false

  // Eje km
  if (frecKm != null && ultimo.odometro != null) {
    celda.proximoKm = ultimo.odometro + frecKm
    if (actual.kmActual != null && actual.kmActual >= ultimo.odometro) {
      ejeKmEvaluado = true
      const consumido = actual.kmActual - ultimo.odometro
      const pct = consumido / frecKm
      pctMax = Math.max(pctMax ?? 0, pct)
      if (actual.kmActual >= celda.proximoKm) {
        estado = peor(estado, "vencido")
      } else if (pct >= PROXIMO_PCT || celda.proximoKm - actual.kmActual <= PROXIMO_KM) {
        estado = peor(estado, "proximo")
      }
    }
  }

  // Eje horas (autoelevadores)
  if (frecHoras != null && ultimo.horometro != null) {
    celda.proximasHoras = ultimo.horometro + frecHoras
    if (actual.horasActuales != null && actual.horasActuales >= ultimo.horometro) {
      ejeHorasEvaluado = true
      const consumido = actual.horasActuales - ultimo.horometro
      const pct = consumido / frecHoras
      pctMax = Math.max(pctMax ?? 0, pct)
      if (actual.horasActuales >= celda.proximasHoras) {
        estado = peor(estado, "vencido")
      } else if (pct >= PROXIMO_PCT) {
        estado = peor(estado, "proximo")
      }
    }
  }

  // Eje tiempo
  if (frecMeses != null) {
    celda.proximaFecha = addMonths(ultimo.fecha, frecMeses)
    const transcurridos = daysBetween(ultimo.fecha, hoy)
    const totales = daysBetween(ultimo.fecha, celda.proximaFecha)
    if (totales > 0) {
      const pct = transcurridos / totales
      pctMax = Math.max(pctMax ?? 0, pct)
      if (hoy >= celda.proximaFecha) {
        estado = peor(estado, "vencido")
      } else if (pct >= PROXIMO_PCT || daysBetween(hoy, celda.proximaFecha) <= PROXIMO_DIAS) {
        estado = peor(estado, "proximo")
      }
    }
  }

  // La tarea tenía eje km/horas pero no hubo lecturas para evaluarlo: el
  // estado queda determinado solo por el tiempo transcurrido.
  celda.soloPorTiempo =
    ((frecKm != null && !ejeKmEvaluado) || (frecHoras != null && !ejeHorasEvaluado)) &&
    frecMeses != null

  celda.estado = estado
  celda.pctConsumido = pctMax != null ? Math.round(pctMax * 100) : null
  return celda
}

export function computeEstadoPlan(params: {
  vehiculos: CatalogoVehiculo[]
  tareas: MantenimientoPlanTarea[]
  overrides: MantenimientoPlanOverride[]
  /** Último realizado completado, indexado por `${dominio}|${tareaId}`. */
  ultimos: Map<string, UltimoRealizadoPorTarea>
  /** Km/horas actuales por dominio. */
  actuales: Map<string, LecturaActual>
  hoy?: string
}): EstadoPlanVehiculo[] {
  const hoy = params.hoy ?? today()
  const overridesPorKey = new Map<string, MantenimientoPlanOverride>()
  for (const o of params.overrides) {
    overridesPorKey.set(`${o.dominio}|${o.tarea_id}`, o)
  }

  const result: EstadoPlanVehiculo[] = []
  for (const v of params.vehiculos) {
    const actual: LecturaActual = params.actuales.get(v.dominio) ?? {
      kmActual: null,
      horasActuales: null,
    }
    const celdas: EstadoPlanCelda[] = []
    for (const t of params.tareas) {
      if (!t.activo) continue
      if (t.tipo_vehiculo !== (v.tipo ?? "camion")) continue
      const override = overridesPorKey.get(`${v.dominio}|${t.id}`)
      if (override && !override.activo) continue
      const ultimo = params.ultimos.get(`${v.dominio}|${t.id}`)
      celdas.push(computeCelda(t, override, ultimo, actual, hoy))
    }
    result.push({
      vehiculo: v,
      kmActual: actual.kmActual,
      horasActuales: actual.horasActuales,
      celdas,
    })
  }
  return result
}

/**
 * Carga todo lo necesario y computa el estado del plan de la flota activa.
 * Lanza Error ante fallos de query (los callers son actions con try/catch).
 */
export async function loadEstadoPlan(): Promise<{
  estados: EstadoPlanVehiculo[]
  tareas: MantenimientoPlanTarea[]
  overrides: MantenimientoPlanOverride[]
  tareasById: Map<string, MantenimientoPlanTarea>
}> {
  const supabase = await createClient()

  const [vehRes, tareasRes, overridesRes, realizadosRes, lecturas] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("*").eq("active", true).order("dominio"),
    supabase
      .from("mantenimiento_plan_tareas")
      .select("*")
      .order("tipo_vehiculo")
      .order("orden"),
    supabase.from("mantenimiento_plan_overrides").select("*"),
    supabase
      .from("mantenimiento_realizado_tareas")
      .select(
        "tarea_id, mantenimiento:mantenimiento_realizados!inner(dominio, fecha, odometro, horometro, estado)"
      )
      .eq("mantenimiento.estado", "completado")
      .not("tarea_id", "is", null),
    fetchLecturas(),
  ])

  if (vehRes.error) throw new Error(vehRes.error.message)
  if (tareasRes.error) throw new Error(tareasRes.error.message)
  if (overridesRes.error) throw new Error(overridesRes.error.message)
  if (realizadosRes.error) throw new Error(realizadosRes.error.message)

  const vehiculos = (vehRes.data || []) as CatalogoVehiculo[]
  const tareas = (tareasRes.data || []) as MantenimientoPlanTarea[]
  const overrides = (overridesRes.data || []) as MantenimientoPlanOverride[]

  // Último realizado completado por (dominio, tarea) + último horómetro por dominio.
  const ultimos = new Map<string, UltimoRealizadoPorTarea>()
  const horasPorDominio = new Map<string, number>()
  for (const r of (realizadosRes.data || []) as unknown as Array<{
    tarea_id: string
    mantenimiento: {
      dominio: string
      fecha: string
      odometro: number | null
      horometro: number | null
    }
  }>) {
    const m = r.mantenimiento
    if (!m) continue
    const key = `${m.dominio}|${r.tarea_id}`
    const prev = ultimos.get(key)
    if (!prev || m.fecha > prev.fecha) {
      ultimos.set(key, {
        fecha: m.fecha,
        odometro: m.odometro != null ? Number(m.odometro) : null,
        horometro: m.horometro != null ? Number(m.horometro) : null,
      })
    }
    if (m.horometro != null) {
      const h = Number(m.horometro)
      if (h > (horasPorDominio.get(m.dominio) ?? -Infinity)) {
        horasPorDominio.set(m.dominio, h)
      }
    }
  }

  const kmActuales = kmActualPorDominio(lecturas)
  const actuales = new Map<string, LecturaActual>()
  for (const v of vehiculos) {
    actuales.set(v.dominio, {
      kmActual: kmActuales.get(v.dominio)?.odometro ?? null,
      horasActuales: horasPorDominio.get(v.dominio) ?? null,
    })
  }

  const estados = computeEstadoPlan({ vehiculos, tareas, overrides, ultimos, actuales })
  const tareasById = new Map(tareas.map((t) => [t.id, t]))
  return { estados, tareas, overrides, tareasById }
}

/**
 * Alerta agregada por vehículo: una de mantenimiento vencido (danger) y/o una
 * de próximo (warning). Las celdas sin_datos no alertan.
 */
export function resumenAlertasMantenimiento(
  estados: EstadoPlanVehiculo[],
  tareasById: Map<string, MantenimientoPlanTarea>
): AlertaVehiculo[] {
  const alertas: AlertaVehiculo[] = []
  for (const e of estados) {
    const nombres = (celdas: typeof e.celdas) =>
      celdas
        .map((c) => tareasById.get(c.tareaId)?.nombre)
        .filter(Boolean)
        .slice(0, 4)
        .join(", ")

    const vencidas = e.celdas.filter((c) => c.estado === "vencido")
    const proximas = e.celdas.filter((c) => c.estado === "proximo")

    if (vencidas.length > 0) {
      alertas.push({
        id: `mv-${e.vehiculo.dominio}`,
        tipo: "mantenimiento_vencido",
        severidad: "danger",
        dominio: e.vehiculo.dominio,
        titulo: `Mantenimiento vencido (${vencidas.length} ${vencidas.length === 1 ? "tarea" : "tareas"})`,
        descripcion: nombres(vencidas) + (vencidas.length > 4 ? "…" : ""),
        valor: vencidas.length,
      })
    }
    if (proximas.length > 0) {
      alertas.push({
        id: `mp-${e.vehiculo.dominio}`,
        tipo: "mantenimiento_proximo",
        severidad: "warning",
        dominio: e.vehiculo.dominio,
        titulo: `Mantenimiento próximo a vencer (${proximas.length} ${proximas.length === 1 ? "tarea" : "tareas"})`,
        descripcion: nombres(proximas) + (proximas.length > 4 ? "…" : ""),
        valor: proximas.length,
      })
    }
  }
  return alertas
}

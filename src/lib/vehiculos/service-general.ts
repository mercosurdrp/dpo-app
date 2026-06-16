import { createClient } from "@/lib/supabase/server"
import {
  addMonths,
  daysBetween,
  fetchLecturas,
  kmActualPorDominio,
  today,
} from "@/lib/vehiculos/lecturas"
import type { CatalogoVehiculo, VehiculoTipo } from "@/types/database"

// "Service general" por unidad para el Tablero operativo de mantenimiento.
//
// A diferencia de la matriz granular por tarea (plan-mantenimiento.ts), acá se
// modela UN próximo service por unidad (como la planilla "Próximo Service GRAL
// FLOTA"): se parte del último service PREVENTIVO registrado y se proyecta el
// vencimiento por km (usando km/día) y/o por tiempo. El semáforo es por días
// restantes: ≤10 rojo, ≤15 naranja, ≤30 amarillo, vencido si ya pasó.

export type EstadoServiceGeneral =
  | "vencido"
  | "rojo"
  | "naranja"
  | "amarillo"
  | "ok"
  | "sin_datos"

export interface ServiceGeneralUnidad {
  dominio: string
  tipo: VehiculoTipo | null
  mide: "km" | "horas"
  estado: EstadoServiceGeneral
  // Último service preventivo
  ultimaFecha: string | null
  ultimoOdometro: number | null
  ultimoHorometro: number | null
  // Frecuencia efectiva (config por unidad ?? default por tipo)
  frecuenciaKm: number | null
  frecuenciaHoras: number | null
  frecuenciaMeses: number | null
  // Estado actual / proyección
  kmActual: number | null
  kmDia: number | null
  proximoKm: number | null
  kmRestante: number | null
  proximaFecha: string | null
  diasRestantes: number | null
  // Texto auxiliar para mostrar qué eje manda
  motivo: "km" | "tiempo" | null
}

const UMBRAL_ROJO = 10
const UMBRAL_NARANJA = 15
const UMBRAL_AMARILLO = 30
const KM_DIA_DEFAULT = 100

// Defaults por tipo cuando no hay fila en mantenimiento_config_unidad.
function defaultsPorTipo(tipo: VehiculoTipo | null): {
  km: number | null
  horas: number | null
  meses: number | null
} {
  switch (tipo) {
    case "autoelevador":
      return { km: null, horas: 250, meses: 6 }
    case "camion":
    case "camioneta":
    case "utilitario":
    default:
      return { km: 20000, horas: null, meses: 12 }
  }
}

export function estadoPorDias(dias: number | null): EstadoServiceGeneral {
  if (dias == null) return "sin_datos"
  if (dias <= 0) return "vencido"
  if (dias <= UMBRAL_ROJO) return "rojo"
  if (dias <= UMBRAL_NARANJA) return "naranja"
  if (dias <= UMBRAL_AMARILLO) return "amarillo"
  return "ok"
}

export interface DocumentoVencimiento {
  id: string
  dominio: string
  categoria: string
  fechaVencimiento: string
  diasRestantes: number
  estado: EstadoServiceGeneral
}

export interface UltimoPreventivo {
  fecha: string
  odometro: number | null
  horometro: number | null
}

export interface ConfigUnidad {
  frecuencia_km: number | null
  frecuencia_horas: number | null
  frecuencia_meses: number | null
  km_dia: number | null
}

export function computeServiceGeneral(params: {
  vehiculos: CatalogoVehiculo[]
  ultimos: Map<string, UltimoPreventivo>
  kmActuales: Map<string, { odometro: number; fecha: string }>
  kmDiaPorDominio: Map<string, number>
  configs: Map<string, ConfigUnidad>
  hoy?: string
}): ServiceGeneralUnidad[] {
  const hoy = params.hoy ?? today()
  const out: ServiceGeneralUnidad[] = []

  for (const v of params.vehiculos) {
    const tipo = (v.tipo ?? null) as VehiculoTipo | null
    const mide: "km" | "horas" = tipo === "autoelevador" ? "horas" : "km"
    const def = defaultsPorTipo(tipo)
    const cfg = params.configs.get(v.dominio)
    const frecKm = cfg?.frecuencia_km ?? def.km
    const frecHoras = cfg?.frecuencia_horas ?? def.horas
    const frecMeses = cfg?.frecuencia_meses ?? def.meses

    const ultimo = params.ultimos.get(v.dominio)
    const kmAct = params.kmActuales.get(v.dominio)?.odometro ?? null
    const kmDia = cfg?.km_dia ?? params.kmDiaPorDominio.get(v.dominio) ?? null

    const base: ServiceGeneralUnidad = {
      dominio: v.dominio,
      tipo,
      mide,
      estado: "sin_datos",
      ultimaFecha: ultimo?.fecha ?? null,
      ultimoOdometro: ultimo?.odometro ?? null,
      ultimoHorometro: ultimo?.horometro ?? null,
      frecuenciaKm: frecKm,
      frecuenciaHoras: frecHoras,
      frecuenciaMeses: frecMeses,
      kmActual: kmAct,
      kmDia: kmDia,
      proximoKm: null,
      kmRestante: null,
      proximaFecha: null,
      diasRestantes: null,
      motivo: null,
    }

    if (!ultimo) {
      out.push(base)
      continue
    }

    const candidatos: { dias: number; motivo: "km" | "tiempo" }[] = []

    // Eje km (solo unidades que miden km y tienen odómetro + km/día)
    if (mide === "km" && frecKm != null && ultimo.odometro != null) {
      base.proximoKm = ultimo.odometro + frecKm
      if (kmAct != null) {
        base.kmRestante = base.proximoKm - kmAct
        const kd = kmDia && kmDia > 0 ? kmDia : KM_DIA_DEFAULT
        const dias = Math.round(base.kmRestante / kd)
        candidatos.push({ dias, motivo: "km" })
      }
    }

    // Eje tiempo (sirve para todos; único disponible para autoelevadores)
    if (frecMeses != null) {
      base.proximaFecha = addMonths(ultimo.fecha, frecMeses)
      const dias = hoy >= base.proximaFecha
        ? -daysBetween(base.proximaFecha, hoy)
        : daysBetween(hoy, base.proximaFecha)
      candidatos.push({ dias, motivo: "tiempo" })
    }

    if (candidatos.length > 0) {
      // El que vence primero (menos días restantes) manda.
      candidatos.sort((a, b) => a.dias - b.dias)
      base.diasRestantes = candidatos[0].dias
      base.motivo = candidatos[0].motivo
      base.estado = estadoPorDias(base.diasRestantes)
    }

    out.push(base)
  }

  return out
}

/**
 * Estima km/día por dominio a partir de las lecturas (pendiente entre la primera
 * y la última lectura disponible si están separadas ≥7 días). Sin datos => no
 * setea (el caller usará el default).
 */
function estimarKmDia(
  lecturas: { dominio: string; fecha: string; odometro: number }[]
): Map<string, number> {
  const porDom = new Map<string, { fecha: string; odometro: number }[]>()
  for (const l of lecturas) {
    if (!porDom.has(l.dominio)) porDom.set(l.dominio, [])
    porDom.get(l.dominio)!.push(l)
  }
  const res = new Map<string, number>()
  for (const [dom, arr] of porDom) {
    arr.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    const first = arr[0]
    const last = arr[arr.length - 1]
    const dias = daysBetween(first.fecha, last.fecha)
    const km = last.odometro - first.odometro
    if (dias >= 7 && km > 0) {
      const kmDia = km / dias
      if (kmDia > 0 && kmDia < 2000) res.set(dom, Math.round(kmDia * 10) / 10)
    }
  }
  return res
}

/** Carga datos y computa el service general de la flota activa. */
export async function loadServiceGeneral(): Promise<ServiceGeneralUnidad[]> {
  const supabase = await createClient()

  const [vehRes, prevRes, cfgRes, lecturas] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("*").eq("active", true).order("dominio"),
    supabase
      .from("mantenimiento_realizados")
      .select("dominio, fecha, odometro, horometro")
      .eq("estado", "completado")
      .eq("tipo", "preventivo")
      .order("fecha", { ascending: false }),
    supabase.from("mantenimiento_config_unidad").select("*"),
    fetchLecturas(),
  ])

  if (vehRes.error) throw new Error(vehRes.error.message)
  if (prevRes.error) throw new Error(prevRes.error.message)
  if (cfgRes.error) throw new Error(cfgRes.error.message)

  const vehiculos = (vehRes.data || []) as CatalogoVehiculo[]

  // Último preventivo por dominio (la query viene ordenada por fecha desc).
  const ultimos = new Map<string, UltimoPreventivo>()
  for (const r of (prevRes.data || []) as Array<{
    dominio: string
    fecha: string
    odometro: number | null
    horometro: number | null
  }>) {
    if (ultimos.has(r.dominio)) continue
    ultimos.set(r.dominio, {
      fecha: r.fecha,
      odometro: r.odometro != null ? Number(r.odometro) : null,
      horometro: r.horometro != null ? Number(r.horometro) : null,
    })
  }

  const configs = new Map<string, ConfigUnidad>()
  for (const c of (cfgRes.data || []) as Array<ConfigUnidad & { dominio: string }>) {
    configs.set(c.dominio, {
      frecuencia_km: c.frecuencia_km,
      frecuencia_horas: c.frecuencia_horas,
      frecuencia_meses: c.frecuencia_meses,
      km_dia: c.km_dia != null ? Number(c.km_dia) : null,
    })
  }

  const kmActuales = kmActualPorDominio(lecturas)
  const kmDiaPorDominio = estimarKmDia(
    lecturas.map((l) => ({ dominio: l.dominio, fecha: l.fecha, odometro: l.odometro }))
  )

  return computeServiceGeneral({ vehiculos, ultimos, kmActuales, kmDiaPorDominio, configs })
}

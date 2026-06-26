import { createClient } from "@/lib/supabase/server"
import {
  addDays,
  addMonths,
  daysBetween,
  fetchLecturas,
  today,
  type Lectura,
} from "@/lib/vehiculos/lecturas"
import type { CatalogoVehiculo, VehiculoTipo } from "@/types/database"

// "Service general" por unidad para el Tablero operativo de mantenimiento.
//
// Replica EXACTAMENTE el criterio de la planilla "Próximo Service GRAL FLOTA"
// (columna G "DIAS PARA SERVICIO"):
//   1. tasa medida = (km últ. registro − km últ. servicio) / días(últ. servicio → últ. registro)
//   2. días del intervalo = frecuencia (20.000 km) ÷ tasa
//        = días(servicio→registro) × frecuencia / km recorridos
//   3. fecha próximo service (F) = fecha últ. servicio + días del intervalo
//   4. días para servicio (G) = fecha próximo service − HOY
// Cuando no se puede medir la tasa (sin recorrido, o autoelevadores que miden
// horas y no hay lectura) se cae a la frecuencia en meses desde el últ. servicio.
// El semáforo es por días restantes: ≤10 rojo, ≤15 naranja, ≤30 amarillo,
// vencido si ya pasó.

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
  // Último service preventivo (col B/C de la planilla)
  ultimaFecha: string | null
  ultimoOdometro: number | null
  ultimoHorometro: number | null
  // Última lectura/registro de odómetro (col D/E)
  fechaUltRegistro: string | null
  kmUltRegistro: number | null
  // Frecuencia efectiva (config por unidad ?? default por tipo)
  frecuenciaKm: number | null
  frecuenciaHoras: number | null
  frecuenciaMeses: number | null
  // Estado actual / proyección
  kmActual: number | null
  kmDia: number | null // tasa medida km/día (col K/J)
  proximoKm: number | null // col H = último km servicio + frecuencia
  kmRestante: number | null
  proximaFecha: string | null // col F
  diasRestantes: number | null // col G
  // Texto auxiliar para mostrar qué eje manda
  motivo: "km" | "horas" | "tiempo" | null
}

const UMBRAL_ROJO = 10
const UMBRAL_NARANJA = 15
const UMBRAL_AMARILLO = 30

// Defaults por tipo cuando no hay fila en mantenimiento_config_unidad.
function defaultsPorTipo(tipo: VehiculoTipo | null): {
  km: number | null
  horas: number | null
  meses: number | null
} {
  switch (tipo) {
    case "autoelevador":
      // Service de autoelevadores cada 200 hs de uso (o 6 meses por tiempo).
      return { km: null, horas: 200, meses: 6 }
    case "acoplado":
      // El acoplado no tiene motor: service por tiempo (frenos/rodamientos).
      return { km: null, horas: null, meses: 12 }
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
  configs: Map<string, ConfigUnidad>
  // Tasa de uso medida (km/día o hs/día) por dominio, a partir de las lecturas.
  tasaUso?: Map<string, { tasa: number }>
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
    const registro = params.kmActuales.get(v.dominio) ?? null
    const kmAct = registro?.odometro ?? null
    const fechaReg = registro?.fecha ?? null

    const base: ServiceGeneralUnidad = {
      dominio: v.dominio,
      tipo,
      mide,
      estado: "sin_datos",
      ultimaFecha: ultimo?.fecha ?? null,
      ultimoOdometro: ultimo?.odometro ?? null,
      ultimoHorometro: ultimo?.horometro ?? null,
      fechaUltRegistro: fechaReg,
      kmUltRegistro: kmAct,
      frecuenciaKm: frecKm,
      frecuenciaHoras: frecHoras,
      frecuenciaMeses: frecMeses,
      kmActual: kmAct,
      kmDia: null,
      proximoKm: null,
      kmRestante: null,
      proximaFecha: null,
      diasRestantes: null,
      motivo: null,
    }

    // --- Criterio columna G de la planilla -------------------------------
    // Proyección por km: tasa medida (servicio→registro) → fecha próximo service.
    if (
      mide === "km" &&
      ultimo &&
      frecKm != null &&
      ultimo.odometro != null &&
      kmAct != null &&
      fechaReg != null
    ) {
      base.proximoKm = ultimo.odometro + frecKm
      base.kmRestante = base.proximoKm - kmAct

      const deltaKm = kmAct - ultimo.odometro
      const deltaDias = daysBetween(ultimo.fecha, fechaReg)
      // tasa preferida: medida; si no se puede medir, override de config.
      let tasa: number | null = null
      if (deltaKm > 0 && deltaDias > 0) tasa = deltaKm / deltaDias
      else if (cfg?.km_dia && cfg.km_dia > 0) tasa = cfg.km_dia

      if (tasa != null && tasa > 0) {
        base.kmDia = Math.round(tasa * 10) / 10
        const intervaloDias = Math.round(frecKm / tasa)
        base.proximaFecha = addDays(ultimo.fecha, intervaloDias)
        base.diasRestantes = daysBetween(hoy, base.proximaFecha)
        base.motivo = "km"
      }
    }

    // Proyección por HORAS (autoelevadores). Toma el horómetro de los checks
    // (guardado en `odometro`) y proyecta el próximo service por uso. Funciona
    // aunque la unidad NO tenga ningún service registrado: en ese caso el
    // próximo service es el siguiente múltiplo de la frecuencia en horas por
    // encima de las horas actuales (p. ej. a las 250 hs). `proximoKm` y
    // `kmRestante` se reutilizan para almacenar el valor en horas.
    if (mide === "horas" && frecHoras != null && kmAct != null) {
      const horasActual = kmAct
      const horasService = ultimo?.horometro ?? null
      base.proximoKm =
        horasService != null
          ? horasService + frecHoras
          : (Math.floor(horasActual / frecHoras) + 1) * frecHoras
      base.kmRestante = base.proximoKm - horasActual

      // tasa de uso (hs/día) medida desde los propios checks; fallback a config.
      const resumen = params.tasaUso?.get(v.dominio) ?? null
      let tasa: number | null = null
      if (resumen && resumen.tasa > 0) tasa = resumen.tasa
      else if (cfg?.km_dia && cfg.km_dia > 0) tasa = cfg.km_dia

      if (tasa != null && tasa > 0 && fechaReg != null) {
        base.kmDia = Math.round(tasa * 10) / 10
        const horasRestantes = Math.max(0, base.proximoKm - horasActual)
        base.proximaFecha = addDays(fechaReg, Math.round(horasRestantes / tasa))
        base.diasRestantes = daysBetween(hoy, base.proximaFecha)
        base.motivo = "horas"
      }
    }

    // Fallback temporal: sin tasa medible (sin recorrido/uso desde el service).
    // Vence a los `frecMeses` desde el último service; si la unidad nunca tuvo
    // service (típico en autoelevadores recién cargados) se cuenta desde el
    // último registro de horómetro para no dejarla en "Sin datos".
    if (base.diasRestantes == null && frecMeses != null) {
      const baseFecha = ultimo?.fecha ?? (mide === "horas" ? fechaReg : null)
      if (baseFecha != null) {
        base.proximaFecha = addMonths(baseFecha, frecMeses)
        base.diasRestantes = daysBetween(hoy, base.proximaFecha)
        base.motivo = "tiempo"
      }
    }

    if (base.diasRestantes != null) base.estado = estadoPorDias(base.diasRestantes)

    out.push(base)
  }

  return out
}

// Cota máxima de km/día plausible: por encima se considera lectura errónea
// (típicamente un cero de más tipeado en el checklist).
const KM_DIA_MAX_PLAUSIBLE = 1500

/**
 * Km actual ROBUSTO por dominio: replica el criterio de "últ. registro" de la
 * planilla = la lectura MÁS RECIENTE por fecha que sea plausible respecto del
 * último service (odómetro ≥ km del service y km/día implícito desde el service
 * ≤ KM_DIA_MAX_PLAUSIBLE). A diferencia de `kmActualPorDominio` (que toma el
 * odómetro máximo), no se deja engañar por outliers altos puntuales (p. ej. un
 * 10.000.000 o un 75.905 viejo cuando la unidad hoy marca 71.404).
 */
export function kmActualRobustoPorDominio(
  lecturas: Lectura[],
  anclas: Map<string, { fecha: string; odometro: number }>
): Map<string, { odometro: number; fecha: string }> {
  const porDom = new Map<string, Lectura[]>()
  for (const l of lecturas) {
    if (!porDom.has(l.dominio)) porDom.set(l.dominio, [])
    porDom.get(l.dominio)!.push(l)
  }

  const result = new Map<string, { odometro: number; fecha: string }>()
  for (const [dom, arr] of porDom) {
    // Orden cronológico ascendente: al sobrescribir, queda la más reciente.
    arr.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return a.hora < b.hora ? -1 : 1
    })

    const ancla = anclas.get(dom) ?? null
    let best: { odometro: number; fecha: string } | null = null

    for (const l of arr) {
      if (ancla != null) {
        if (l.fecha < ancla.fecha) continue // anterior al service
        if (l.odometro < ancla.odometro) continue // por debajo del km del service
        const dias = Math.max(1, daysBetween(ancla.fecha, l.fecha))
        if ((l.odometro - ancla.odometro) / dias > KM_DIA_MAX_PLAUSIBLE) continue // outlier
      }
      best = { odometro: l.odometro, fecha: l.fecha } // la más reciente plausible gana
    }

    if (best != null) result.set(dom, best)
  }
  return result
}

/**
 * Tasa de uso medida por dominio (unidad/día) = (lectura más reciente − lectura
 * más antigua) / días entre ambas. Para autoelevadores las lecturas son horas
 * (guardadas en `odometro`), así que devuelve hs/día. Se ignora si no hay al
 * menos dos lecturas con avance positivo.
 */
export function tasaUsoPorDominio(lecturas: Lectura[]): Map<string, { tasa: number }> {
  const porDom = new Map<string, Lectura[]>()
  for (const l of lecturas) {
    if (!porDom.has(l.dominio)) porDom.set(l.dominio, [])
    porDom.get(l.dominio)!.push(l)
  }
  const out = new Map<string, { tasa: number }>()
  for (const [dom, arr] of porDom) {
    arr.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return a.hora < b.hora ? -1 : 1
    })
    const primera = arr[0]
    const ultima = arr[arr.length - 1]
    const dias = daysBetween(primera.fecha, ultima.fecha)
    const delta = ultima.odometro - primera.odometro
    if (dias > 0 && delta > 0) out.set(dom, { tasa: delta / dias })
  }
  return out
}

/** Carga datos y computa el service general de la flota activa. */
export async function loadServiceGeneral(): Promise<ServiceGeneralUnidad[]> {
  const supabase = await createClient()

  const [vehRes, prevRes, cfgRes, lecturas] = await Promise.all([
    supabase.from("catalogo_vehiculos").select("*").eq("active", true).order("dominio"),
    supabase
      .from("mantenimiento_realizados")
      .select("dominio, fecha, odometro, horometro, tipo, es_service_general")
      .eq("estado", "completado")
      .order("fecha", { ascending: false }),
    supabase.from("mantenimiento_config_unidad").select("*"),
    fetchLecturas(),
  ])

  if (vehRes.error) throw new Error(vehRes.error.message)
  if (prevRes.error) throw new Error(prevRes.error.message)
  if (cfgRes.error) throw new Error(cfgRes.error.message)

  const vehiculos = (vehRes.data || []) as CatalogoVehiculo[]

  // Ancla del próximo service por dominio: el ÚLTIMO registro con
  // es_service_general (service rodado, replica la planilla); si la unidad no
  // tiene ninguno, cae al último preventivo. La query viene ordenada por fecha
  // desc, así que la primera coincidencia de cada tipo es la más reciente.
  const ultimos = new Map<string, UltimoPreventivo>()
  const ultimosPreventivo = new Map<string, UltimoPreventivo>()
  for (const r of (prevRes.data || []) as Array<{
    dominio: string
    fecha: string
    odometro: number | null
    horometro: number | null
    tipo: string | null
    es_service_general: boolean | null
  }>) {
    const reg: UltimoPreventivo = {
      fecha: r.fecha,
      odometro: r.odometro != null ? Number(r.odometro) : null,
      horometro: r.horometro != null ? Number(r.horometro) : null,
    }
    if (r.es_service_general && !ultimos.has(r.dominio)) {
      ultimos.set(r.dominio, reg)
    } else if (r.tipo === "preventivo" && !ultimosPreventivo.has(r.dominio)) {
      ultimosPreventivo.set(r.dominio, reg)
    }
  }
  // Fallback: unidades sin service general usan su último preventivo.
  for (const [dom, reg] of ultimosPreventivo) {
    if (!ultimos.has(dom)) ultimos.set(dom, reg)
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

  // Ancla del km actual robusto = último service (fecha + odómetro) cuando existe.
  const anclas = new Map<string, { fecha: string; odometro: number }>()
  for (const [dom, u] of ultimos) {
    if (u.odometro != null) anclas.set(dom, { fecha: u.fecha, odometro: u.odometro })
  }
  const kmActuales = kmActualRobustoPorDominio(lecturas, anclas)
  const tasaUso = tasaUsoPorDominio(lecturas)

  return computeServiceGeneral({ vehiculos, ultimos, kmActuales, configs, tasaUso })
}

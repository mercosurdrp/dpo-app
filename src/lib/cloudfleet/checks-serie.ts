// Serie diaria de indicadores de checks (Cloudfleet) para la reunión de
// logística de Misiones. Lee de la tabla `cloudfleet_checklists` (sincronizada
// por el cron) y, si el rango incluye HOY, dispara un refresh best-effort del
// día para que el matinal vea las liberaciones recién hechas.
//
// Indicadores (por fecha ARG):
//   - checks_aprobados   = LIBERACION de camiones Misiones con status APROBADO
//   - checks_rechazados  = LIBERACION de camiones Misiones con status != APROBADO
//   - ae_aprobados       = PREOPERACIONAL AE de TOYOTA4/5/6 con status APROBADO
//   - lib_count / ret_count = LIBERACION / RETORNO de camiones (para Adherencia)
//
// Filtros Misiones (ver memoria reference_flota_misiones_cloudfleet):
//   - costCenter Eldorado / Iguazú (el toggle de sucursal acota a uno).
//   - se excluyen 6 patentes de otro negocio.
//   - los AE TOYOTA4 (Iguazú) y TOYOTA5/6 (Eldorado) caen por costCenter.

import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncCloudfleetChecklists } from "./sync"
import type { MisionesSucursal } from "@/lib/foxtrot/auto-indicadores-misiones"

// Patentes de OTRO negocio — nunca cuentan en la distribución Misiones.
const PLACAS_EXCLUIDAS = new Set([
  "HIE914",
  "FTI805",
  "FWN676",
  "AED831",
  "KPI-695",
  "AF757XZ",
])
const AE_VEHICLES = new Set(["TOYOTA4", "TOYOTA5", "TOYOTA6"])
const CC_POR_SUCURSAL: Record<Exclude<MisionesSucursal, "todo">, string> = {
  eldorado: "Eldorado",
  iguazu: "Iguazú",
}

// Camiones Misiones cuya LIBERACION a veces llega de Cloudfleet sin centro de
// costo (null). Sin esto, el check no matchea ninguna sucursal y se descarta
// (ej.: HJR136 salió aprobado pero el indicador contaba 8 en vez de 9).
// Se les asigna su sucursal real para que igual cuenten. Código en MAYÚSCULAS.
const CC_FALLBACK_POR_PATENTE: Record<string, string> = {
  HJR136: "Iguazú",
}

export interface CloudfleetChecksSerie {
  checks_aprobados: Record<string, number | null>
  checks_rechazados: Record<string, number | null>
  ae_aprobados: Record<string, number | null>
  lib_count: Record<string, number | null>
  ret_count: Record<string, number | null>
}

/** Estado de un camión en el día: liberación + retorno (regla 1 + 1). */
export interface ChecksCamionDia {
  dominio: string
  sucursal: string | null
  liberacion: "aprobada" | "rechazada" | "ausente"
  retorno: "presente" | "ausente"
  /** true si falta la liberación o el retorno (no cumple la regla 1 + 1). */
  incompleto: boolean
}

export interface CloudfleetChecksDetalleDia {
  fecha: string
  camiones: ChecksCamionDia[]
  lib_aprobadas: number
  lib_rechazadas: number
  lib_total: number
  ret_total: number
  /** Dominios con retorno pero SIN liberación (salieron sin liberar). */
  sin_liberacion: string[]
  /** Dominios con liberación pero SIN retorno (sin cerrar el día). */
  sin_retorno: string[]
}

function todayARG(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

interface ChecklistRow {
  fecha: string
  tipo: string | null
  vehicle_code: string | null
  cost_center: string | null
  status: string | null
}

export async function buildCloudfleetChecksSerie(
  supabase: SupabaseClient,
  fechas: string[],
  sucursal: MisionesSucursal = "todo",
): Promise<CloudfleetChecksSerie> {
  const serie: CloudfleetChecksSerie = {
    checks_aprobados: {},
    checks_rechazados: {},
    ae_aprobados: {},
    lib_count: {},
    ret_count: {},
  }
  for (const f of fechas) {
    serie.checks_aprobados[f] = 0
    serie.checks_rechazados[f] = 0
    serie.ae_aprobados[f] = 0
    serie.lib_count[f] = 0
    serie.ret_count[f] = 0
  }
  if (fechas.length === 0) return serie

  // Refresh best-effort del día de hoy (las liberaciones se hacen a la mañana,
  // después del cron nocturno). No bloquea ni rompe si Cloudfleet falla.
  const hoy = todayARG()
  if (fechas.includes(hoy)) {
    try {
      await syncCloudfleetChecklists(createAdminClient(), hoy, hoy)
    } catch {
      // ignorado a propósito: el resto de la serie usa lo ya sincronizado.
    }
  }

  const { data, error } = await supabase
    .from("cloudfleet_checklists")
    .select("fecha,tipo,vehicle_code,cost_center,status")
    .gte("fecha", fechas[0])
    .lte("fecha", fechas[fechas.length - 1])
  if (error || !data) return serie // tabla ausente / error → todo en 0 (sin romper)

  const ccPermitido = (cc: string | null): boolean => {
    if (sucursal === "todo") return cc === "Eldorado" || cc === "Iguazú"
    return cc === CC_POR_SUCURSAL[sucursal]
  }

  // AE Aprobados cuenta EQUIPOS distintos por día (TOYOTA4/5/6 con al menos un
  // preoperacional aprobado), no la cantidad total de checks. Junta los códigos
  // en un Set por fecha y al final cuenta su tamaño (0–3 por día).
  const aeAprobPorFecha: Record<string, Set<string>> = {}
  for (const f of fechas) aeAprobPorFecha[f] = new Set<string>()

  // Los indicadores cuentan CAMIONES DISTINTOS por día, no checklists: la regla
  // operativa es 1 liberación + 1 retorno por camión. Un camión con varias
  // liberaciones (ej. rehizo el check) cuenta una sola vez; cuenta como
  // aprobado si AL MENOS UNA de sus liberaciones quedó aprobada, y como
  // rechazado solo si tuvo liberación y NINGUNA aprobó. Así nunca está en
  // aprobados y rechazados a la vez, y el denominador de Adherencia
  // (2 × camiones) cuadra.
  interface EstadoCamion {
    libExiste: boolean
    libAprobada: boolean
    retExiste: boolean
  }
  const camionesPorFecha: Record<string, Map<string, EstadoCamion>> = {}
  for (const f of fechas) camionesPorFecha[f] = new Map()

  for (const r of data as ChecklistRow[]) {
    const f = r.fecha
    if (!(f in serie.checks_aprobados)) continue
    const code = (r.vehicle_code ?? "").toUpperCase()
    const tipo = r.tipo ?? ""
    const aprobado = (r.status ?? "").toUpperCase() === "APROBADO"
    // Centro de costo efectivo: usa el de Cloudfleet o, si vino vacío, el
    // fallback fijo de la patente (ver CC_FALLBACK_POR_PATENTE).
    const cc = r.cost_center ?? CC_FALLBACK_POR_PATENTE[code] ?? null

    if (tipo === "PREOPERACIONAL AE") {
      if (AE_VEHICLES.has(code) && ccPermitido(cc) && aprobado) {
        aeAprobPorFecha[f].add(code)
      }
      continue
    }

    // Camiones (excluir AE y patentes de otro negocio).
    if (PLACAS_EXCLUIDAS.has(code)) continue
    if (!ccPermitido(cc)) continue

    const est =
      camionesPorFecha[f].get(code) ??
      { libExiste: false, libAprobada: false, retExiste: false }
    if (tipo === "LIBERACION") {
      est.libExiste = true
      if (aprobado) est.libAprobada = true
    } else if (tipo === "RETORNO") {
      est.retExiste = true
    }
    camionesPorFecha[f].set(code, est)
  }

  for (const f of fechas) {
    let aprob = 0
    let rech = 0
    let lib = 0
    let ret = 0
    for (const est of camionesPorFecha[f].values()) {
      if (est.libExiste) {
        lib++
        if (est.libAprobada) aprob++
        else rech++
      }
      if (est.retExiste) ret++
    }
    serie.checks_aprobados[f] = aprob
    serie.checks_rechazados[f] = rech
    serie.lib_count[f] = lib
    serie.ret_count[f] = ret
    serie.ae_aprobados[f] = aeAprobPorFecha[f].size
  }

  return serie
}

/**
 * Detalle por camión de un día: estado de liberación y retorno de cada camión,
 * con los mismos filtros que la serie (patentes excluidas, fallback de CC,
 * sucursal). Para el popup del tablero de reuniones — permite ver quién salió
 * sin liberación o cerró sin retorno (regla: 1 liberación + 1 retorno por
 * camión). Los PREOPERACIONAL AE no son camiones de reparto → se ignoran acá.
 */
export async function buildCloudfleetChecksDetalleDia(
  supabase: SupabaseClient,
  fecha: string,
  sucursal: MisionesSucursal = "todo",
): Promise<CloudfleetChecksDetalleDia> {
  // Refresh best-effort si es hoy (las liberaciones se cargan a la mañana).
  if (fecha === todayARG()) {
    try {
      await syncCloudfleetChecklists(createAdminClient(), fecha, fecha)
    } catch {
      // ignorado: usamos lo ya sincronizado.
    }
  }

  const vacio: CloudfleetChecksDetalleDia = {
    fecha,
    camiones: [],
    lib_aprobadas: 0,
    lib_rechazadas: 0,
    lib_total: 0,
    ret_total: 0,
    sin_liberacion: [],
    sin_retorno: [],
  }

  const { data, error } = await supabase
    .from("cloudfleet_checklists")
    .select("fecha,tipo,vehicle_code,cost_center,status")
    .eq("fecha", fecha)
  if (error || !data) return vacio

  const ccPermitido = (cc: string | null): boolean => {
    if (sucursal === "todo") return cc === "Eldorado" || cc === "Iguazú"
    return cc === CC_POR_SUCURSAL[sucursal]
  }

  interface Est {
    sucursal: string | null
    libExiste: boolean
    libAprobada: boolean
    retExiste: boolean
  }
  const map = new Map<string, Est>()
  for (const r of data as ChecklistRow[]) {
    const code = (r.vehicle_code ?? "").toUpperCase()
    const tipo = r.tipo ?? ""
    if (tipo !== "LIBERACION" && tipo !== "RETORNO") continue
    if (PLACAS_EXCLUIDAS.has(code)) continue
    const cc = r.cost_center ?? CC_FALLBACK_POR_PATENTE[code] ?? null
    if (!ccPermitido(cc)) continue
    const aprobado = (r.status ?? "").toUpperCase() === "APROBADO"
    const est =
      map.get(code) ??
      { sucursal: cc, libExiste: false, libAprobada: false, retExiste: false }
    if (cc && !est.sucursal) est.sucursal = cc
    if (tipo === "LIBERACION") {
      est.libExiste = true
      if (aprobado) est.libAprobada = true
    } else {
      est.retExiste = true
    }
    map.set(code, est)
  }

  const camiones: ChecksCamionDia[] = []
  const sinLiberacion: string[] = []
  const sinRetorno: string[] = []
  let libAprob = 0
  let libRech = 0
  let libTotal = 0
  let retTotal = 0
  for (const [code, est] of map) {
    const liberacion: ChecksCamionDia["liberacion"] = est.libExiste
      ? est.libAprobada
        ? "aprobada"
        : "rechazada"
      : "ausente"
    const retorno: ChecksCamionDia["retorno"] = est.retExiste
      ? "presente"
      : "ausente"
    if (est.libExiste) {
      libTotal++
      if (est.libAprobada) libAprob++
      else libRech++
    }
    if (est.retExiste) retTotal++
    if (!est.libExiste && est.retExiste) sinLiberacion.push(code)
    if (est.libExiste && !est.retExiste) sinRetorno.push(code)
    camiones.push({
      dominio: code,
      sucursal: est.sucursal,
      liberacion,
      retorno,
      incompleto: !est.libExiste || !est.retExiste,
    })
  }
  camiones.sort((a, b) => a.dominio.localeCompare(b.dominio))
  sinLiberacion.sort()
  sinRetorno.sort()

  return {
    fecha,
    camiones,
    lib_aprobadas: libAprob,
    lib_rechazadas: libRech,
    lib_total: libTotal,
    ret_total: retTotal,
    sin_liberacion: sinLiberacion,
    sin_retorno: sinRetorno,
  }
}

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

export interface CloudfleetChecksSerie {
  checks_aprobados: Record<string, number | null>
  checks_rechazados: Record<string, number | null>
  ae_aprobados: Record<string, number | null>
  lib_count: Record<string, number | null>
  ret_count: Record<string, number | null>
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

  for (const r of data as ChecklistRow[]) {
    const f = r.fecha
    if (!(f in serie.checks_aprobados)) continue
    const code = (r.vehicle_code ?? "").toUpperCase()
    const tipo = r.tipo ?? ""
    const aprobado = (r.status ?? "").toUpperCase() === "APROBADO"

    if (tipo === "PREOPERACIONAL AE") {
      if (AE_VEHICLES.has(code) && ccPermitido(r.cost_center) && aprobado) {
        serie.ae_aprobados[f] = (serie.ae_aprobados[f] ?? 0) + 1
      }
      continue
    }

    // Camiones (excluir AE y patentes de otro negocio).
    if (PLACAS_EXCLUIDAS.has(code)) continue
    if (!ccPermitido(r.cost_center)) continue

    if (tipo === "LIBERACION") {
      serie.lib_count[f] = (serie.lib_count[f] ?? 0) + 1
      if (aprobado) {
        serie.checks_aprobados[f] = (serie.checks_aprobados[f] ?? 0) + 1
      } else {
        serie.checks_rechazados[f] = (serie.checks_rechazados[f] ?? 0) + 1
      }
    } else if (tipo === "RETORNO") {
      serie.ret_count[f] = (serie.ret_count[f] ?? 0) + 1
    }
  }

  return serie
}

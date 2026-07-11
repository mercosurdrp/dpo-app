import type { SupabaseClient } from "@supabase/supabase-js"
import { loadEstadoPlan } from "@/lib/vehiculos/plan-mantenimiento"
import {
  loadServiceGeneral,
  type ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import type { EstadoPlanVehiculo } from "@/types/database"

// KPIs de flota "foto": no tienen histórico reconstruible desde los datos, así
// que un cron diario pisa el valor del mes ARG en curso en
// `flota_kpi_snapshots` y al cerrar el mes queda la última foto. El tablero de
// Indicadores lee esos snapshots para los meses cerrados y calcula en vivo el
// mes en curso.

export interface FlotaKpiSnapshotRow {
  kpi: string
  year: number
  mes: number
  valor: number | null
}

/** Año y mes del día de hoy en horario argentino (el server corre en UTC). */
export function ymArgentina(): { year: number; mes: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
  return { year: Number(s.slice(0, 4)), mes: Number(s.slice(5, 7)) }
}

/** Mismo cálculo que la card del tablero: tareas al día ÷ tareas con datos. */
export function cumplimientoPlanDesdeEstados(
  estados: EstadoPlanVehiculo[]
): number | null {
  let ok = 0
  let noOk = 0
  for (const e of estados) {
    for (const c of e.celdas) {
      if (c.estado === "ok") ok++
      else if (c.estado === "proximo" || c.estado === "vencido") noOk++
    }
  }
  return ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
}

export function servicesVencidosDesdeProgramacion(
  programacion: ServiceGeneralUnidad[]
): number {
  return programacion.filter((p) => p.estado === "vencido").length
}

/**
 * Calcula la foto del día de los KPIs sin histórico y la upserta en el mes
 * ARG en curso. Pensado para el cron diario con service role; también sirve
 * para backfill manual.
 */
export async function capturarFlotaKpiSnapshots(client: SupabaseClient): Promise<{
  year: number
  mes: number
  valores: Record<string, number | null>
}> {
  const [{ estados }, programacion] = await Promise.all([
    loadEstadoPlan(client),
    loadServiceGeneral(client),
  ])

  const { year, mes } = ymArgentina()
  const valores: Record<string, number | null> = {
    cumplimiento_plan: cumplimientoPlanDesdeEstados(estados),
    services_vencidos: servicesVencidosDesdeProgramacion(programacion),
  }

  const rows = Object.entries(valores).map(([kpi, valor]) => ({
    kpi,
    year,
    mes,
    valor,
  }))
  const { error } = await client
    .from("flota_kpi_snapshots")
    .upsert(rows, { onConflict: "kpi,year,mes" })
  if (error) throw new Error(error.message)

  return { year, mes, valores }
}

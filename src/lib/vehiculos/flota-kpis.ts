import type { SupabaseClient } from "@supabase/supabase-js"
import { conformidadDocumental } from "@/lib/vehiculos/documentos-conformidad"
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

/** Fecha de hoy "YYYY-MM-DD" en horario argentino. */
function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** % de unidades activas sin requisitos legales (tipo vehículo) vencidos. */
async function docsConformidadFlota(client: SupabaseClient): Promise<number | null> {
  const hoy = hoyArgentina()
  const [vehRes, catsRes, reqsRes] = await Promise.all([
    client.from("catalogo_vehiculos").select("dominio").eq("active", true),
    client
      .from("requisitos_legales_categorias")
      .select("id")
      .eq("tipo_identificador", "vehiculo"),
    client
      .from("requisitos_legales")
      .select("nombre, fecha_vencimiento, categoria_id")
      .not("fecha_vencimiento", "is", null),
  ])
  if (vehRes.error) throw new Error(vehRes.error.message)
  if (catsRes.error) throw new Error(catsRes.error.message)
  if (reqsRes.error) throw new Error(reqsRes.error.message)

  const catsVehiculo = new Set(((catsRes.data || []) as Array<{ id: string }>).map((c) => c.id))
  const docs = ((reqsRes.data || []) as Array<{
    nombre: string
    fecha_vencimiento: string
    categoria_id: string
  }>)
    .filter((r) => catsVehiculo.has(r.categoria_id))
    .map((r) => ({
      dominio: r.nombre,
      // Solo importa el signo: vencido si la fecha quedó atrás de hoy (ARG).
      diasRestantes: r.fecha_vencimiento.slice(0, 10) >= hoy ? 0 : -1,
    }))
  const dominios = ((vehRes.data || []) as Array<{ dominio: string }>).map((v) => v.dominio)
  return conformidadDocumental(dominios, docs).pct
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
  const [{ estados }, programacion, docsConformidad] = await Promise.all([
    loadEstadoPlan(client),
    loadServiceGeneral(client),
    docsConformidadFlota(client),
  ])

  const { year, mes } = ymArgentina()
  const valores: Record<string, number | null> = {
    cumplimiento_plan: cumplimientoPlanDesdeEstados(estados),
    services_vencidos: servicesVencidosDesdeProgramacion(programacion),
    docs_conformidad: docsConformidad,
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

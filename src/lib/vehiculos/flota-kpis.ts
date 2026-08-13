import type { SupabaseClient } from "@supabase/supabase-js"
import { conformidadDocumental } from "@/lib/vehiculos/documentos-conformidad"
import { cumplimientoPlanDesdeEstados } from "@/lib/vehiculos/plan-cumplimiento"
import { loadEstadoPlan } from "@/lib/vehiculos/plan-mantenimiento"
import {
  loadServiceGeneral,
  type ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"

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

// El cumplimiento del plan vive en `plan-cumplimiento` (módulo puro) porque lo
// comparten el cron y la tarjeta del tablero, que es un componente cliente.
export {
  cumplimientoPlanDesdeEstados,
  PLAN_COBERTURA_MINIMA,
} from "@/lib/vehiculos/plan-cumplimiento"

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
 * % de ítems OK sobre evaluables en la matriz de estándares (DPO 1.2), global y
 * abierto por criticidad: el punto pide distinguir lo mandatorio de lo de
 * excelencia, y un desvío legal no puede promediarse contra uno de confort.
 */
async function estandaresConformidadFlota(client: SupabaseClient): Promise<{
  total: number | null
  mandatorio: number | null
  excelencia: number | null
}> {
  const [vehRes, itemsRes, cumplRes] = await Promise.all([
    client
      .from("catalogo_vehiculos")
      .select("dominio")
      .eq("active", true)
      .in("tipo", ["camion", "autoelevador"]),
    client.from("flota_estandar_items").select("id, criticidad").eq("activo", true),
    client
      .from("flota_estandar_cumplimiento")
      .select("dominio, item_id, estado")
      .limit(5000),
  ])
  if (vehRes.error) throw new Error(vehRes.error.message)
  if (itemsRes.error) throw new Error(itemsRes.error.message)
  if (cumplRes.error) throw new Error(cumplRes.error.message)

  const dominios = new Set(
    ((vehRes.data || []) as Array<{ dominio: string }>).map((v) => v.dominio)
  )
  const criticidadDe = new Map(
    ((itemsRes.data || []) as Array<{ id: string; criticidad: string }>).map((i) => [
      i.id,
      i.criticidad,
    ])
  )
  const conteo: Record<string, [number, number]> = {
    total: [0, 0],
    mandatorio: [0, 0],
    excelencia: [0, 0],
  }
  // Los N/A no suman a ningún lado: un ítem que no aplica al modal no es desvío.
  const sumar = (bucket: [number, number] | undefined, estado: string) => {
    if (!bucket) return
    if (estado === "ok") bucket[0]++
    else if (estado === "no_ok") bucket[1]++
  }
  for (const c of (cumplRes.data || []) as Array<{
    dominio: string
    item_id: string
    estado: string
  }>) {
    if (!dominios.has(c.dominio)) continue
    const crit = criticidadDe.get(c.item_id)
    if (!crit) continue
    sumar(conteo.total, c.estado)
    sumar(conteo[crit], c.estado)
  }
  const pct = ([ok, noOk]: [number, number]) =>
    ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
  return {
    total: pct(conteo.total),
    mandatorio: pct(conteo.mandatorio),
    excelencia: pct(conteo.excelencia),
  }
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
  const [{ estados }, programacion, docsConformidad, estandaresConformidad] =
    await Promise.all([
      loadEstadoPlan(client),
      loadServiceGeneral(client),
      docsConformidadFlota(client),
      estandaresConformidadFlota(client),
    ])

  const { year, mes } = ymArgentina()
  const plan = cumplimientoPlanDesdeEstados(estados)
  const valores: Record<string, number | null> = {
    cumplimiento_plan: plan.pct,
    // La cobertura viaja con el KPI para que los meses YA CERRADOS también
    // puedan mostrar sobre cuántas tareas se calculó ese porcentaje: el estado
    // del plan no se puede reconstruir hacia atrás, así que si no se fotografía
    // hoy, mañana no existe.
    plan_tareas_con_dato: plan.conDato,
    plan_tareas_total: plan.total,
    services_vencidos: servicesVencidosDesdeProgramacion(programacion),
    docs_conformidad: docsConformidad,
    estandares_conformidad: estandaresConformidad.total,
    estandares_mandatorios: estandaresConformidad.mandatorio,
    estandares_excelencia: estandaresConformidad.excelencia,
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

"use server"

// Tablero de Indicadores de Flota: metas configurables por KPI y planes de
// acción por KPI + mes. Planes: clon del patrón TML/TI (tml-plan-accion.ts)
// con discriminador `kpi`.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

export type FlotaKpi =
  | "disponibilidad"
  | "utilizacion"
  | "costo_total"
  | "pct_preventivo"
  | "cumplimiento_plan"
  | "services_vencidos"
  | "checklist_deteccion"
  | "checklist_resolucion"
  | "docs_conformidad"
  | "inventario_exactitud"
  | "combustible_kml"
  | "co2_flota"
  | "cil_tareas"

export type PlanFlotaEstado = "abierto" | "en_progreso" | "cerrado"
export type PlanFlotaItemEstado = "pendiente" | "en_progreso" | "completado"

export interface FlotaMeta {
  kpi: FlotaKpi
  meta: number | null
  comparador: ">=" | "<="
  unidad: string
}

export interface FlotaPlanAccion {
  id: string
  kpi: FlotaKpi
  mes: number
  year: number
  valor_mes: number | null
  meta_mes: number | null
  causa_raiz: string
  estado: PlanFlotaEstado
  fecha_cierre: string | null
  resultado_cierre: string | null
  evidencia_cierre_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FlotaPlanAccionItem {
  id: string
  plan_id: string
  accion: string
  responsable: string
  fecha_compromiso: string
  estado: PlanFlotaItemEstado
  fecha_completado: string | null
  observaciones: string | null
  orden: number
  created_at: string
}

export interface FlotaPlanConItems extends FlotaPlanAccion {
  items: FlotaPlanAccionItem[]
}

// ==================== METAS ====================

export async function getFlotaMetas(): Promise<
  { data: FlotaMeta[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_metas")
      .select("kpi, meta, comparador, unidad")
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaMeta[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateFlotaMeta(input: {
  kpi: FlotaKpi
  meta: number | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_metas")
      .update({ meta: input.meta, updated_by: profile.id })
      .eq("kpi", input.kpi)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SERIES EXTRA (PIs calculados) ====================

export interface PuntoSerieKpi {
  ym: string // "YYYY-MM"
  valor: number | null
}

/** Ventana de matcheo defecto de checklist → OT correctiva (días). */
const DETECCION_VENTANA_DIAS = 15

/** Factor de emisión gasoil (kg CO2 por litro), estándar ABI/GOP. */
const CO2_KG_POR_LITRO = 2.68

const pad2 = (n: number) => String(n).padStart(2, "0")

/** Últimos 3 meses ARG como "YYYY-MM" (2 cerrados + el actual). */
function meses3Argentina(): string[] {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
  const year = Number(s.slice(0, 4))
  const mes = Number(s.slice(5, 7))
  const out: string[] = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(year, mes - 1 - i, 1)
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }
  return out
}

/**
 * PIs del pilar Flota 1.3 calculados por mes (últimos 3):
 *  - checklist_deteccion: % de OTs correctivas del mes con defecto detectado
 *    en el checklist del mismo dominio dentro de los 15 días previos.
 *  - checklist_resolucion: días promedio entre el defecto y su plan resuelto
 *    (por mes de resolución; usa updated_at del plan al pasar a resuelto).
 */
export async function getFlotaKpiSeriesExtra(): Promise<
  { data: Partial<Record<FlotaKpi, PuntoSerieKpi[]>> } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const meses = meses3Argentina()
    const inicioVentana = `${meses[0]}-01`
    // Los defectos previos a una correctiva de principios del 1er mes pueden
    // caer hasta 15 días antes de la ventana.
    const d0 = new Date(`${inicioVentana}T00:00:00`)
    d0.setDate(d0.getDate() - DETECCION_VENTANA_DIAS)
    const inicioDefectos = `${d0.getFullYear()}-${pad2(d0.getMonth() + 1)}-${pad2(d0.getDate())}`

    // Defectos de checklist (paginado: PostgREST topea en 1000 filas).
    const PAGE = 1000
    const defectos: Array<{ fecha: string; dominio: string }> = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from("checklist_respuestas")
        .select("id, cv:checklist_vehiculos!inner(fecha, dominio)")
        .not("valor", "in", '("ok","bueno")')
        .gte("cv.fecha", inicioDefectos)
        .order("id", { ascending: true })
        .range(desde, desde + PAGE - 1)
      if (error) return { error: error.message }
      const rows = (data || []) as unknown as Array<{
        cv: { fecha: string; dominio: string } | null
      }>
      for (const r of rows) {
        if (r.cv) defectos.push({ fecha: r.cv.fecha, dominio: r.cv.dominio })
      }
      if (rows.length < PAGE) break
    }

    const [otRes, planesRes, conteosRes, cargasRes, cilRes] = await Promise.all([
      supabase
        .from("mantenimiento_realizados")
        .select("dominio, fecha")
        .eq("tipo", "correctivo")
        .neq("estado", "cancelado")
        .gte("fecha", inicioVentana),
      supabase
        .from("checklist_planes_accion")
        .select("created_at, updated_at")
        .eq("estado", "resuelto")
        .gte("updated_at", `${inicioVentana}T00:00:00`),
      supabase
        .from("mantenimiento_conteos")
        .select("id, fecha, items:mantenimiento_conteo_items(stock_sistema, stock_contado)")
        .gte("fecha", inicioVentana)
        .order("fecha", { ascending: true }),
      supabase
        .from("registro_combustible")
        .select("fecha, litros, km_recorridos")
        .gte("fecha", inicioVentana),
      supabase.from("mantenimiento_cil").select("fecha").gte("fecha", inicioVentana),
    ])
    if (otRes.error) return { error: otRes.error.message }
    if (planesRes.error) return { error: planesRes.error.message }
    if (conteosRes.error) return { error: conteosRes.error.message }
    if (cargasRes.error) return { error: cargasRes.error.message }
    if (cilRes.error) return { error: cilRes.error.message }

    // Fechas de defecto por dominio, ordenadas, para el matcheo por ventana.
    const defectosPorDominio = new Map<string, string[]>()
    for (const d of defectos) {
      if (!defectosPorDominio.has(d.dominio)) defectosPorDominio.set(d.dominio, [])
      defectosPorDominio.get(d.dominio)!.push(d.fecha)
    }
    for (const fechas of defectosPorDominio.values()) fechas.sort()

    const MS_DIA = 86_400_000
    const anticipadas = new Map<string, { conDefecto: number; total: number }>()
    for (const ot of (otRes.data || []) as Array<{ dominio: string; fecha: string }>) {
      const ym = ot.fecha.slice(0, 7)
      if (!meses.includes(ym)) continue
      const acc = anticipadas.get(ym) ?? { conDefecto: 0, total: 0 }
      acc.total++
      const tOt = new Date(`${ot.fecha}T00:00:00`).getTime()
      const hubo = (defectosPorDominio.get(ot.dominio) ?? []).some((f) => {
        const t = new Date(`${f}T00:00:00`).getTime()
        return t <= tOt && tOt - t <= DETECCION_VENTANA_DIAS * MS_DIA
      })
      if (hubo) acc.conDefecto++
      anticipadas.set(ym, acc)
    }

    const resolucion = new Map<string, { dias: number; n: number }>()
    for (const p of (planesRes.data || []) as Array<{
      created_at: string
      updated_at: string
    }>) {
      const ym = p.updated_at.slice(0, 7)
      if (!meses.includes(ym)) continue
      const dias =
        (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / MS_DIA
      if (dias < 0) continue
      const acc = resolucion.get(ym) ?? { dias: 0, n: 0 }
      acc.dias += dias
      acc.n++
      resolucion.set(ym, acc)
    }

    // Exactitud de inventario: el ÚLTIMO conteo de cada mes (viene ordenado asc,
    // así que el último visto por mes pisa a los anteriores).
    const exactitud = new Map<string, number | null>()
    for (const c of (conteosRes.data || []) as unknown as Array<{
      fecha: string
      items: Array<{ stock_sistema: number; stock_contado: number }>
    }>) {
      const ym = c.fecha.slice(0, 7)
      if (!meses.includes(ym) || c.items.length === 0) continue
      const sinDif = c.items.filter(
        (i) => Number(i.stock_sistema) === Number(i.stock_contado)
      ).length
      exactitud.set(ym, (sinDif / c.items.length) * 100)
    }

    // Combustible: km/l ponderado del mes (Σ km ÷ Σ litros de cargas con
    // medición, mismo criterio que el módulo Combustible) + CO2 estimado
    // sobre TODOS los litros cargados.
    const combustible = new Map<
      string,
      { km: number; litrosConKm: number; litros: number }
    >()
    for (const c of (cargasRes.data || []) as Array<{
      fecha: string
      litros: number | null
      km_recorridos: number | null
    }>) {
      const ym = String(c.fecha).slice(0, 7)
      if (!meses.includes(ym)) continue
      const acc = combustible.get(ym) ?? { km: 0, litrosConKm: 0, litros: 0 }
      const litros = Number(c.litros ?? 0)
      const km = Number(c.km_recorridos ?? 0)
      acc.litros += litros
      if (km > 0) {
        acc.km += km
        acc.litrosConKm += litros
      }
      combustible.set(ym, acc)
    }

    // Tareas CIL completadas por mes.
    const cilPorMes = new Map<string, number>()
    for (const t of (cilRes.data || []) as Array<{ fecha: string }>) {
      const ym = String(t.fecha).slice(0, 7)
      if (meses.includes(ym)) cilPorMes.set(ym, (cilPorMes.get(ym) ?? 0) + 1)
    }

    return {
      data: {
        cil_tareas: meses.map((ym) => ({ ym, valor: cilPorMes.get(ym) ?? null })),
        combustible_kml: meses.map((ym) => {
          const c = combustible.get(ym)
          return { ym, valor: c && c.litrosConKm > 0 ? c.km / c.litrosConKm : null }
        }),
        co2_flota: meses.map((ym) => {
          const c = combustible.get(ym)
          return { ym, valor: c && c.litros > 0 ? c.litros * CO2_KG_POR_LITRO : null }
        }),
        checklist_deteccion: meses.map((ym) => {
          const a = anticipadas.get(ym)
          return { ym, valor: a && a.total > 0 ? (a.conDefecto / a.total) * 100 : null }
        }),
        checklist_resolucion: meses.map((ym) => {
          const r = resolucion.get(ym)
          return { ym, valor: r && r.n > 0 ? r.dias / r.n : null }
        }),
        inventario_exactitud: meses.map((ym) => ({
          ym,
          valor: exactitud.get(ym) ?? null,
        })),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== SNAPSHOTS ====================

// Fotos mensuales de los KPIs sin histórico (las escribe el cron
// /api/vehiculos/flota-kpi-cron). El tablero las usa como serie de meses
// cerrados; el mes en curso se calcula en vivo.
export interface FlotaKpiSnapshot {
  kpi: string
  year: number
  mes: number
  valor: number | null
}

export async function getFlotaKpiSnapshots(): Promise<
  { data: FlotaKpiSnapshot[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("flota_kpi_snapshots")
      .select("kpi, year, mes, valor")
    if (error) return { error: error.message }
    return { data: (data || []) as FlotaKpiSnapshot[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== PLANES ====================

export async function getFlotaPlanes(): Promise<
  { data: FlotaPlanConItems[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [planRes, itemRes] = await Promise.all([
      supabase
        .from("flota_plan_accion")
        .select("*")
        .order("year", { ascending: false })
        .order("mes", { ascending: false }),
      supabase
        .from("flota_plan_accion_items")
        .select("*")
        .order("orden", { ascending: true }),
    ])
    if (planRes.error) return { error: planRes.error.message }
    if (itemRes.error) return { error: itemRes.error.message }

    const items = (itemRes.data || []) as FlotaPlanAccionItem[]
    const itemsByPlan = new Map<string, FlotaPlanAccionItem[]>()
    for (const it of items) {
      if (!itemsByPlan.has(it.plan_id)) itemsByPlan.set(it.plan_id, [])
      itemsByPlan.get(it.plan_id)!.push(it)
    }
    const planes = ((planRes.data || []) as FlotaPlanAccion[]).map((p) => ({
      ...p,
      items: itemsByPlan.get(p.id) || [],
    }))
    return { data: planes }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createFlotaPlan(input: {
  kpi: FlotaKpi
  mes: number
  year: number
  valorMes: number | null
  metaMes: number | null
  causaRaiz: string
  items: Array<{ accion: string; responsable: string; fechaCompromiso: string }>
}): Promise<{ data: FlotaPlanAccion } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: plan, error: errPlan } = await supabase
      .from("flota_plan_accion")
      .insert({
        kpi: input.kpi,
        mes: input.mes,
        year: input.year,
        valor_mes: input.valorMes,
        meta_mes: input.metaMes,
        causa_raiz: input.causaRaiz.trim(),
        estado: "abierto" as PlanFlotaEstado,
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (errPlan) return { error: errPlan.message }

    if (input.items.length > 0) {
      const payload = input.items.map((it, idx) => ({
        plan_id: plan.id,
        accion: it.accion.trim(),
        responsable: it.responsable.trim(),
        fecha_compromiso: it.fechaCompromiso,
        estado: "pendiente" as PlanFlotaItemEstado,
        orden: idx,
      }))
      const { error: errItems } = await supabase
        .from("flota_plan_accion_items")
        .insert(payload)
      if (errItems) {
        await supabase.from("flota_plan_accion").delete().eq("id", plan.id)
        return { error: errItems.message }
      }
    }

    return { data: plan as FlotaPlanAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function cerrarFlotaPlan(
  id: string,
  resultadoCierre: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_plan_accion")
      .update({
        estado: "cerrado" as PlanFlotaEstado,
        fecha_cierre: new Date().toISOString().slice(0, 10),
        resultado_cierre: resultadoCierre.trim(),
      })
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteFlotaPlan(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()
    const { error } = await supabase.from("flota_plan_accion").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ITEMS ====================

export async function addFlotaPlanItem(input: {
  planId: string
  accion: string
  responsable: string
  fechaCompromiso: string
}): Promise<{ data: FlotaPlanAccionItem } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { count } = await supabase
      .from("flota_plan_accion_items")
      .select("*", { count: "exact", head: true })
      .eq("plan_id", input.planId)

    const { data, error } = await supabase
      .from("flota_plan_accion_items")
      .insert({
        plan_id: input.planId,
        accion: input.accion.trim(),
        responsable: input.responsable.trim(),
        fecha_compromiso: input.fechaCompromiso,
        estado: "pendiente" as PlanFlotaItemEstado,
        orden: count ?? 0,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }

    // Plan con items en marcha: pasa de abierto a en_progreso.
    await supabase
      .from("flota_plan_accion")
      .update({ estado: "en_progreso" as PlanFlotaEstado })
      .eq("id", input.planId)
      .eq("estado", "abierto")

    return { data: data as FlotaPlanAccionItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateFlotaPlanItem(input: {
  id: string
  estado?: PlanFlotaItemEstado
  observaciones?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.estado !== undefined) {
      update.estado = input.estado
      update.fecha_completado =
        input.estado === "completado" ? new Date().toISOString().slice(0, 10) : null
    }
    if (input.observaciones !== undefined) update.observaciones = input.observaciones
    const { error } = await supabase
      .from("flota_plan_accion_items")
      .update(update)
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteFlotaPlanItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_plan_accion_items")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

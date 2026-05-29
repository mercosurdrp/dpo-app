"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { registerActivity } from "@/lib/dpo-activity"
import type {
  TiKpis,
  TiRegistro,
  TiSemanal,
  TiMensual,
  TiPlanAccion,
  TiPlanAccionItem,
  TiPlanResumen,
  PlanTiEstado,
  PlanTiItemEstado,
} from "@/types/database"

// ===== TI — Tiempo Interno =====
// TI = (fichaje biométrico de salida) − (hora del checklist de retorno), por chofer/día.
const TI_META_MINUTOS = 30
const PCT_META_MINIMO = 65
const TI_OUTLIER_MINUTOS = 180 // > 3h se descarta como anomalía (no es tiempo interno)

// 🚨 Zona horaria (ver src/actions/asistencia.ts y tml-foxtrot.ts):
// - checklist_vehiculos.hora => UTC real (now() de Postgres).
// - asistencia_marcas.fecha_marca en Pampeana => hora ARG disfrazada de UTC
//   (MARCAS_EN_HORA_ARGENTINA=true) → hay que sumar 3h para obtener el UTC real.
const MARCAS_EN_HORA_ARGENTINA = process.env.MARCAS_EN_HORA_ARGENTINA === "true"
const AR_OFFSET_MS = 3 * 3600 * 1000

// Instante real (UTC ms) de una marca biométrica.
function salidaUtcMs(fechaMarca: string): number {
  const ms = new Date(fechaMarca).getTime()
  return MARCAS_EN_HORA_ARGENTINA ? ms + AR_OFFSET_MS : ms
}
// Fecha ARG (YYYY-MM-DD) de una marca, para emparejar con checklist.fecha.
function fechaArgDeMarca(fechaMarca: string): string {
  if (MARCAS_EN_HORA_ARGENTINA) return fechaMarca.slice(0, 10) // ya viene en ARG nominal
  return new Date(new Date(fechaMarca).getTime() - AR_OFFSET_MS).toISOString().slice(0, 10)
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase().replace(/\s+/g, " ")
}

const MESES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]

function semanaDelAnio(fechaISO: string): { year: number; semana: number } {
  const date = new Date(fechaISO + "T12:00:00")
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - startOfYear.getTime()
  const semana = Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7)
  return { year: date.getFullYear(), semana }
}

// ==================== CÁLCULO DE KPIs ====================
export async function getTiKpis(filters?: {
  fechaDesde?: string
  fechaHasta?: string
}): Promise<{ data: TiKpis } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // 1) Retornos
    let qRet = supabase
      .from("checklist_vehiculos")
      .select("fecha,chofer,dominio,hora")
      .eq("tipo", "retorno")
      .order("fecha", { ascending: true })
    if (filters?.fechaDesde) qRet = qRet.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) qRet = qRet.lte("fecha", filters.fechaHasta)
    const retRes = await qRet
    if (retRes.error) return { error: retRes.error.message }
    const retornos = (retRes.data || []) as {
      fecha: string; chofer: string; dominio: string; hora: string
    }[]

    // 2) Resolver chofer → empleado (legajo). Usa mapeo_empleado_chofer + match por nombre.
    const [empRes, mapRes] = await Promise.all([
      supabase.from("empleados").select("id,legajo,nombre"),
      supabase.from("mapeo_empleado_chofer").select("nombre_chofer,empleado_id"),
    ])
    if (empRes.error) return { error: empRes.error.message }
    const empleados = (empRes.data || []) as { id: string; legajo: number; nombre: string }[]
    const empById = new Map(empleados.map((e) => [e.id, e]))
    const byName = new Map(empleados.map((e) => [norm(e.nombre), e]))
    const mapByChofer = new Map(
      ((mapRes.data || []) as { nombre_chofer: string; empleado_id: string }[])
        .map((m) => [norm(m.nombre_chofer), empById.get(m.empleado_id)])
        .filter((x): x is [string, { id: string; legajo: number; nombre: string }] => !!x[1]),
    )
    function resolveLegajo(chofer: string): { legajo: number } | null {
      const n = norm(chofer)
      if (mapByChofer.has(n)) return mapByChofer.get(n)!
      if (byName.has(n)) return byName.get(n)!
      const hit = empleados.find(
        (e) => norm(e.nombre).startsWith(n) || n.startsWith(norm(e.nombre)),
      )
      return hit || null
    }

    // 3) Marcas de salida (S) del rango, indexadas por legajo|fechaARG → última (máx instante).
    const desde = filters?.fechaDesde || retornos[0]?.fecha || "2026-01-01"
    const { data: marcasData, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("legajo,fecha_marca,tipo_marca")
      .eq("tipo_marca", "S")
      .gte("fecha_marca", desde)
    if (marcasErr) return { error: marcasErr.message }
    const salidaPorLegFecha = new Map<string, number>()
    for (const m of (marcasData || []) as { legajo: number; fecha_marca: string }[]) {
      const f = fechaArgDeMarca(m.fecha_marca)
      const k = `${m.legajo}|${f}`
      const ms = salidaUtcMs(m.fecha_marca)
      if (!salidaPorLegFecha.has(k) || ms > salidaPorLegFecha.get(k)!) {
        salidaPorLegFecha.set(k, ms)
      }
    }

    // 4) Calcular TI por retorno
    const registros: TiRegistro[] = []
    const tis: number[] = []
    let sinBio = 0, excluidos = 0
    for (const r of retornos) {
      const emp = resolveLegajo(r.chofer)
      const base = { fecha: r.fecha, chofer: r.chofer, dominio: r.dominio, hora_retorno: r.hora }
      if (!emp) {
        registros.push({ ...base, legajo: null, hora_salida: null, ti_minutos: null, motivo_sin_dato: "sin_match" })
        continue
      }
      const salMs = salidaPorLegFecha.get(`${emp.legajo}|${r.fecha}`)
      if (salMs == null) {
        sinBio++
        registros.push({ ...base, legajo: emp.legajo, hora_salida: null, ti_minutos: null, motivo_sin_dato: "sin_biometrico" })
        continue
      }
      const ti = Math.round((salMs - new Date(r.hora).getTime()) / 60000)
      const salidaIso = new Date(salMs).toISOString()
      if (ti < 0) {
        excluidos++
        registros.push({ ...base, legajo: emp.legajo, hora_salida: salidaIso, ti_minutos: ti, motivo_sin_dato: "negativo" })
        continue
      }
      if (ti > TI_OUTLIER_MINUTOS) {
        excluidos++
        registros.push({ ...base, legajo: emp.legajo, hora_salida: salidaIso, ti_minutos: ti, motivo_sin_dato: "outlier" })
        continue
      }
      tis.push(ti)
      registros.push({ ...base, legajo: emp.legajo, hora_salida: salidaIso, ti_minutos: ti, motivo_sin_dato: null })
    }

    // 5) KPIs globales
    const conTi = tis.length
    const promedioMinutos = conTi ? Math.round(tis.reduce((a, b) => a + b, 0) / conTi) : 0
    const sorted = [...tis].sort((a, b) => a - b)
    const mediana = conTi ? sorted[Math.floor(conTi / 2)] : 0
    const dentroMeta = tis.filter((t) => t <= TI_META_MINUTOS).length
    const pctDentroMeta = conTi ? Math.round((dentroMeta / conTi) * 100) : 0

    // 6) Series semanal / mensual (solo registros con TI válido)
    const validos = registros.filter((r) => r.motivo_sin_dato === null && r.ti_minutos != null)
    const semMap = new Map<string, { tiempos: number[]; year: number; semana: number }>()
    const mesMap = new Map<string, { tiempos: number[]; year: number; mes: number }>()
    for (const r of validos) {
      const { year, semana } = semanaDelAnio(r.fecha)
      const sk = `${year}-${semana}`
      if (!semMap.has(sk)) semMap.set(sk, { tiempos: [], year, semana })
      semMap.get(sk)!.tiempos.push(r.ti_minutos!)
      const d = new Date(r.fecha + "T12:00:00")
      const mk = `${d.getFullYear()}-${d.getMonth() + 1}`
      if (!mesMap.has(mk)) mesMap.set(mk, { tiempos: [], year: d.getFullYear(), mes: d.getMonth() + 1 })
      mesMap.get(mk)!.tiempos.push(r.ti_minutos!)
    }
    const aggSem = (g: { tiempos: number[]; year: number; semana: number }): TiSemanal => {
      const dm = g.tiempos.filter((t) => t <= TI_META_MINUTOS).length
      return {
        semana: g.semana, year: g.year,
        promedio_minutos: Math.round(g.tiempos.reduce((a, b) => a + b, 0) / g.tiempos.length),
        total: g.tiempos.length, dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tiempos.length) * 100),
      }
    }
    const aggMes = (g: { tiempos: number[]; year: number; mes: number }): TiMensual => {
      const dm = g.tiempos.filter((t) => t <= TI_META_MINUTOS).length
      return {
        mes: g.mes, year: g.year,
        promedio_minutos: Math.round(g.tiempos.reduce((a, b) => a + b, 0) / g.tiempos.length),
        total: g.tiempos.length, dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tiempos.length) * 100),
      }
    }
    const semanal = Array.from(semMap.values()).map(aggSem)
      .sort((a, b) => a.year - b.year || a.semana - b.semana)
    const mensual = Array.from(mesMap.values()).map(aggMes)
      .sort((a, b) => a.year - b.year || a.mes - b.mes)

    // registros más recientes primero para la tabla
    registros.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))

    return {
      data: {
        totalRetornos: retornos.length,
        conTi, sinBiometrico: sinBio, excluidos,
        promedioMinutos, mediana, dentroMeta, pctDentroMeta,
        metaMinutos: TI_META_MINUTOS, pctMetaMinimo: PCT_META_MINIMO,
        semanal, mensual, registros,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== RESUMEN mensual + plan asociado ====================
function mesFueraDeMeta(promedio: number, pct: number): boolean {
  return promedio > TI_META_MINUTOS || pct < PCT_META_MINIMO
}

export async function getTiPlanesResumen(): Promise<
  { data: TiPlanResumen[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const kpisRes = await getTiKpis()
    if ("error" in kpisRes) return { error: kpisRes.error }
    const mensual = kpisRes.data.mensual

    const [planRes, itemRes] = await Promise.all([
      supabase.from("ti_plan_accion").select("*").order("year").order("mes"),
      supabase.from("ti_plan_accion_items").select("*"),
    ])
    if (planRes.error) return { error: planRes.error.message }
    if (itemRes.error) return { error: itemRes.error.message }
    const planes = (planRes.data || []) as TiPlanAccion[]
    const items = (itemRes.data || []) as TiPlanAccionItem[]

    const planByKey = new Map(planes.map((p) => [`${p.year}-${p.mes}`, p]))
    const itemsByPlan = new Map<string, TiPlanAccionItem[]>()
    for (const it of items) {
      if (!itemsByPlan.has(it.plan_id)) itemsByPlan.set(it.plan_id, [])
      itemsByPlan.get(it.plan_id)!.push(it)
    }

    const resumen: TiPlanResumen[] = mensual.map((m) => {
      const plan = planByKey.get(`${m.year}-${m.mes}`) ?? null
      const itemsPlan = plan ? itemsByPlan.get(plan.id) || [] : []
      return {
        year: m.year, mes: m.mes,
        promedio_ti: m.promedio_minutos,
        pct_dentro_meta: m.pct_dentro_meta,
        fuera_meta: mesFueraDeMeta(m.promedio_minutos, m.pct_dentro_meta),
        plan,
        items_total: itemsPlan.length,
        items_completados: itemsPlan.filter((i) => i.estado === "completado").length,
      }
    })
    resumen.sort((a, b) => b.year - a.year || b.mes - a.mes)
    return { data: resumen }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CRUD PLAN (clon del patrón TML) ====================
interface CreatePlanInput {
  mes: number
  year: number
  promedioTiMes: number
  pctDentroMetaMes: number
  causaRaiz: string
  items: Array<{ accion: string; responsable: string; fechaCompromiso: string }>
}

export async function createTiPlan(
  input: CreatePlanInput,
): Promise<{ data: TiPlanAccion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: plan, error: errPlan } = await supabase
      .from("ti_plan_accion")
      .insert({
        mes: input.mes,
        year: input.year,
        promedio_ti_mes: input.promedioTiMes,
        pct_dentro_meta_mes: input.pctDentroMetaMes,
        causa_raiz: input.causaRaiz.trim(),
        estado: "abierto" as PlanTiEstado,
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
        estado: "pendiente" as PlanTiItemEstado,
        orden: idx,
      }))
      const { error: errItems } = await supabase.from("ti_plan_accion_items").insert(payload)
      if (errItems) {
        await supabase.from("ti_plan_accion").delete().eq("id", plan.id)
        return { error: errItems.message }
      }
    }

    await registerActivity(supabase, {
      tipo: "plan_creado",
      titulo: `Plan Acción Tiempo Interno — ${MESES[input.mes - 1]} ${input.year}`,
      pilar_codigo: "entrega",
      punto_codigo: "1.3",
      requisito_codigo: "R1.3.4",
      referencia_id: plan.id,
      referencia_tipo: "ti_plan",
      user_id: profile.id,
      user_nombre: profile.nombre,
      metadata: { promedio_ti: input.promedioTiMes, pct_dentro_meta: input.pctDentroMetaMes },
    })

    return { data: plan as TiPlanAccion }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getTiPlanById(
  id: string,
): Promise<{ data: { plan: TiPlanAccion; items: TiPlanAccionItem[] } } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [planRes, itemsRes] = await Promise.all([
      supabase.from("ti_plan_accion").select("*").eq("id", id).single(),
      supabase.from("ti_plan_accion_items").select("*").eq("plan_id", id).order("orden"),
    ])
    if (planRes.error) return { error: planRes.error.message }
    if (itemsRes.error) return { error: itemsRes.error.message }
    return {
      data: {
        plan: planRes.data as TiPlanAccion,
        items: (itemsRes.data || []) as TiPlanAccionItem[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateTiPlanCausaRaiz(
  id: string, causaRaiz: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("ti_plan_accion").update({ causa_raiz: causaRaiz.trim() }).eq("id", id)
    if (error) return { error: error.message }
    await registerActivity(supabase, {
      tipo: "plan_actualizado",
      titulo: "Plan Acción Tiempo Interno actualizado",
      descripcion: "Causa raíz actualizada",
      pilar_codigo: "entrega", punto_codigo: "1.3", requisito_codigo: "R1.3.4",
      referencia_id: id, referencia_tipo: "ti_plan",
      user_id: profile.id, user_nombre: profile.nombre,
    })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function cerrarTiPlan(
  id: string, resultadoCierre: string, evidenciaCierreUrl?: string | null,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const update: Record<string, unknown> = {
      estado: "cerrado" as PlanTiEstado,
      fecha_cierre: new Date().toISOString().slice(0, 10),
      resultado_cierre: resultadoCierre.trim(),
    }
    if (evidenciaCierreUrl !== undefined) update.evidencia_cierre_url = evidenciaCierreUrl?.trim() || null
    const { error } = await supabase.from("ti_plan_accion").update(update).eq("id", id)
    if (error) return { error: error.message }
    await registerActivity(supabase, {
      tipo: "plan_cerrado",
      titulo: "Plan Acción Tiempo Interno cerrado",
      descripcion: resultadoCierre.trim(),
      pilar_codigo: "entrega", punto_codigo: "1.3", requisito_codigo: "R1.3.4",
      referencia_id: id, referencia_tipo: "ti_plan",
      user_id: profile.id, user_nombre: profile.nombre,
    })
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteTiPlan(id: string): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.from("ti_plan_accion").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CRUD ITEMS ====================
export async function addTiPlanItem(input: {
  planId: string; accion: string; responsable: string; fechaCompromiso: string
}): Promise<{ data: TiPlanAccionItem } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { count } = await supabase
      .from("ti_plan_accion_items").select("*", { count: "exact", head: true })
      .eq("plan_id", input.planId)
    const { data, error } = await supabase
      .from("ti_plan_accion_items")
      .insert({
        plan_id: input.planId,
        accion: input.accion.trim(),
        responsable: input.responsable.trim(),
        fecha_compromiso: input.fechaCompromiso,
        estado: "pendiente" as PlanTiItemEstado,
        orden: count ?? 0,
      })
      .select("*").single()
    if (error) return { error: error.message }
    await supabase
      .from("ti_plan_accion").update({ estado: "en_progreso" as PlanTiEstado })
      .eq("id", input.planId).eq("estado", "abierto")
    return { data: data as TiPlanAccionItem }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateTiPlanItem(input: {
  id: string
  accion?: string
  responsable?: string
  fechaCompromiso?: string
  estado?: PlanTiItemEstado
  fechaCompletado?: string | null
  observaciones?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.accion !== undefined) update.accion = input.accion.trim()
    if (input.responsable !== undefined) update.responsable = input.responsable.trim()
    if (input.fechaCompromiso !== undefined) update.fecha_compromiso = input.fechaCompromiso
    if (input.estado !== undefined) {
      update.estado = input.estado
      if (input.estado === "completado" && input.fechaCompletado === undefined) {
        update.fecha_completado = new Date().toISOString().slice(0, 10)
      }
    }
    if (input.fechaCompletado !== undefined) update.fecha_completado = input.fechaCompletado
    if (input.observaciones !== undefined) update.observaciones = input.observaciones
    const { error } = await supabase.from("ti_plan_accion_items").update(update).eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteTiPlanItem(id: string): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase.from("ti_plan_accion_items").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

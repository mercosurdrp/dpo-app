"use server"

/**
 * Dimensionamiento de Distribución/Flota (DPO Planeamiento 3.1) — SOLO Pampeana.
 * Trabaja en CAJAS EQUIVALENTES (CEq): la capacidad de la flota se carga en CEq
 * y el volumen a distribuir (ruteo_cierres, en bultos) se convierte a CEq con un
 * factor promedio editable (dim_config.factor_ceq_bulto). Demanda vs capacidad
 * instalada → camiones necesarios, ocupación y KPIs (dropsize, % no ruteado).
 */

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import { requireAuth, requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

/** Promedio y pico (sobre valores > 0) de un Map fecha→valor. */
function statsPorDia(m: Map<string, number>): { prom: number; pico: number; dias: number } {
  const vals = [...m.values()].filter((v) => v > 0)
  if (!vals.length) return { prom: 0, pico: 0, dias: 0 }
  return { prom: vals.reduce((s, x) => s + x, 0) / vals.length, pico: Math.max(...vals), dias: vals.length }
}

/** Lee las filas de un blob de deposito-esteban (shared/load). [] si falla. */
async function fetchDepositoFilas(module: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${DEPOSITO_API_BASE}/api/shared/load?module=${module}`, { cache: "no-store" })
    if (!res.ok) return []
    const j = (await res.json()) as { data?: { filas?: Record<string, unknown>[] } }
    return j.data?.filas ?? []
  } catch {
    return []
  }
}

type Result<T> = { data: T } | { error: string }

const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = ["admin", "admin_rrhh", "supervisor"]
const SOLO_PAMPEANA = "El dimensionamiento solo está disponible en Región Pampeana."
const CHESS_DASHBOARD_BASE = "https://chess-dashboard-mercosurdrps-projects.vercel.app"

export interface FactorCeqResult {
  factor: number
  periodo: { desde: string; hasta: string }
  sumCeq: number
  sumBultos: number
  skusConPallet: number
  bultosEnvaseExcluidos: number
}

async function fetchFactorCeq(): Promise<FactorCeqResult | null> {
  const key = process.env.PLANIFICADOR_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${CHESS_DASHBOARD_BASE}/api/factor-ceq?empresa=pampeana`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as FactorCeqResult
  } catch {
    return null
  }
}

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface DimConfig {
  peso_kg_bulto: number
  dias_operativos_mes: number
  viajes_por_dia: number
  factor_ceq_bulto: number
  prod_bul_hh: number
  horas_turno: number
  dotacion_almacen: number
  prod_pal_h: number
  dotacion_maquinistas: number
  factor_retorno_distrib: number
}

export interface RolFte {
  volumenProm: number          // bultos/día (pickeros) o pallets/día (maquinistas)
  volumenPico: number
  productividad: number         // bul/HH (pickeros) o pal/HH (maquinistas)
  diasConDatos: number
  fteNecesariosProm: number
  fteNecesariosPico: number
  dotacion: number
}

export interface AlmacenData {
  mes: string
  pickeros: RolFte
  maquinistas: RolFte & { palAcarreoProm: number; palCargaProm: number; factorRetorno: number }
}

export interface KpiObjetivo {
  kpi: string
  nombre: string
  unidad: string
  objetivo: number
  mejor_si: "mayor" | "menor"
}

export interface FlotaUnidad {
  dominio: string
  descripcion: string | null
  tipo: string | null
  capacidad_ceq: number
  capacidad_kg: number | null
  activo: boolean
  enTaller: boolean
}

export interface MetricasDistribucion {
  mes: string
  diasCerrados: number
  volumenCeqPromedio: number
  volumenCeqPico: number
  clientesPromedio: number
  dropsizeCeqPromedio: number
  pctNoRuteadoPromedio: number
  ocupacionPromedio: number
  camionesNecesariosPromedio: number
  camionesNecesariosPico: number
}

export interface DimPlan {
  id: string
  que: string
  por_que: string | null
  quien: string | null
  donde: string | null
  cuando: string | null
  como: string | null
  cuanto: string | null
  estado: "pendiente" | "en_curso" | "completado"
  created_at: string
}

export interface DimData {
  config: DimConfig
  objetivos: KpiObjetivo[]
  flota: FlotaUnidad[]
  capacidadInstaladaDiaria: number // CEq: Σ capacidad_ceq (disponibles) × viajes_por_dia
  unidadesDisponibles: number
  metricas: MetricasDistribucion | null
  metricasError: string | null
  almacen: AlmacenData | null
  almacenError: string | null
  planes: DimPlan[]
}

// ─── Carga principal ────────────────────────────────────────────────────────

export async function getDatosDimensionamiento(): Promise<Result<DimData>> {
  try {
    await requireAuth()
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()

    const [configRes, objetivosRes, capacidadRes, vehiculosRes, tallerRes, planesRes] =
      await Promise.all([
        supabase.from("dim_config").select("peso_kg_bulto, dias_operativos_mes, viajes_por_dia, factor_ceq_bulto, prod_bul_hh, horas_turno, dotacion_almacen, prod_pal_h, dotacion_maquinistas, factor_retorno_distrib").eq("id", 1).maybeSingle(),
        supabase.from("dim_kpi_objetivos").select("kpi, nombre, unidad, objetivo, mejor_si").order("kpi"),
        supabase.from("dim_flota_capacidad").select("dominio, capacidad_ceq, capacidad_kg, activo"),
        supabase.from("catalogo_vehiculos").select("dominio, descripcion, tipo, active").eq("sector", "distribucion").eq("active", true),
        supabase.from("mantenimiento_realizados").select("dominio").eq("estado", "en_taller"),
        supabase.from("dim_planes").select("*").order("created_at", { ascending: false }).limit(100),
      ])

    const config: DimConfig = {
      peso_kg_bulto: Number(configRes.data?.peso_kg_bulto ?? 0),
      dias_operativos_mes: Number(configRes.data?.dias_operativos_mes ?? 26),
      viajes_por_dia: Number(configRes.data?.viajes_por_dia ?? 1) || 1,
      factor_ceq_bulto: Number(configRes.data?.factor_ceq_bulto ?? 1) || 1,
      prod_bul_hh: Number(configRes.data?.prod_bul_hh ?? 300) || 300,
      horas_turno: Number(configRes.data?.horas_turno ?? 8) || 8,
      dotacion_almacen: Number(configRes.data?.dotacion_almacen ?? 0),
      prod_pal_h: Number(configRes.data?.prod_pal_h ?? 15) || 15,
      dotacion_maquinistas: Number(configRes.data?.dotacion_maquinistas ?? 3),
      factor_retorno_distrib: Number(configRes.data?.factor_retorno_distrib ?? 0),
    }
    const objetivos = (objetivosRes.data ?? []) as KpiObjetivo[]

    const capMap = new Map(
      (capacidadRes.data ?? []).map((c) => [c.dominio as string, c]),
    )
    const enTaller = new Set((tallerRes.data ?? []).map((t) => t.dominio as string))

    const flota: FlotaUnidad[] = (vehiculosRes.data ?? []).map((v) => {
      const cap = capMap.get(v.dominio as string)
      return {
        dominio: v.dominio as string,
        descripcion: (v.descripcion as string | null) ?? null,
        tipo: (v.tipo as string | null) ?? null,
        capacidad_ceq: Number(cap?.capacidad_ceq ?? 0),
        capacidad_kg: cap?.capacidad_kg != null ? Number(cap.capacidad_kg) : null,
        activo: cap ? Boolean(cap.activo) : true,
        enTaller: enTaller.has(v.dominio as string),
      }
    })

    const disponibles = flota.filter((u) => u.activo && !u.enTaller)
    const capacidadInstaladaDiaria =
      disponibles.reduce((s, u) => s + u.capacidad_ceq, 0) * config.viajes_por_dia

    // Métricas de distribución del mes en curso (ruteo_cierres cerrados).
    // Volumen en bultos → CEq con el factor promedio.
    let metricas: MetricasDistribucion | null = null
    let metricasError: string | null = null
    const f = config.factor_ceq_bulto
    const hoy = new Date()
    const mesAA = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`
    const desde = `${mesAA}-01`
    const { data: cierres, error: cierresErr } = await supabase
      .from("ruteo_cierres")
      .select("fecha, pergamino_bultos, pergamino_clientes, ramallo_bultos, ramallo_clientes, bultos_no_ruteados")
      .eq("estado", "cerrado")
      .gte("fecha", desde)
      .order("fecha", { ascending: false })

    if (cierresErr) {
      metricasError = cierresErr.message
    } else if (cierres && cierres.length > 0) {
      const filas = cierres.map((c) => {
        const ceq = (Number(c.pergamino_bultos ?? 0) + Number(c.ramallo_bultos ?? 0)) * f
        const clientes = Number(c.pergamino_clientes ?? 0) + Number(c.ramallo_clientes ?? 0)
        const noRutCeq = Number(c.bultos_no_ruteados ?? 0) * f
        return {
          ceq,
          clientes,
          dropsize: clientes > 0 ? ceq / clientes : 0,
          pctNoRut: ceq + noRutCeq > 0 ? (noRutCeq / (ceq + noRutCeq)) * 100 : 0,
        }
      })
      const n = filas.length
      const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / n
      const volProm = avg(filas.map((x) => x.ceq))
      const volPico = Math.max(...filas.map((x) => x.ceq))
      const capUnidad = disponibles.length > 0 ? capacidadInstaladaDiaria / disponibles.length : 0
      metricas = {
        mes: mesAA,
        diasCerrados: n,
        volumenCeqPromedio: Math.round(volProm),
        volumenCeqPico: Math.round(volPico),
        clientesPromedio: Math.round(avg(filas.map((x) => x.clientes))),
        dropsizeCeqPromedio: Math.round(avg(filas.map((x) => x.dropsize)) * 10) / 10,
        pctNoRuteadoPromedio: Math.round(avg(filas.map((x) => x.pctNoRut)) * 10) / 10,
        ocupacionPromedio:
          capacidadInstaladaDiaria > 0 ? Math.round((volProm / capacidadInstaladaDiaria) * 1000) / 10 : 0,
        camionesNecesariosPromedio: capUnidad > 0 ? Math.ceil(volProm / (capUnidad * config.viajes_por_dia)) : 0,
        camionesNecesariosPico: capUnidad > 0 ? Math.ceil(volPico / (capUnidad * config.viajes_por_dia)) : 0,
      }
    }

    // Almacén (FTE): pickeros (bultos procesados) + maquinistas (pallets a procesar).
    let almacen: AlmacenData | null = null
    let almacenError: string | null = null
    try {
      // Pickeros: bultos/día de ocupacion_bodega_diaria
      const { data: ob } = await supabase.from("ocupacion_bodega_diaria").select("fecha, bultos_total").gte("fecha", desde)
      const bultosPorDia = new Map<string, number>()
      for (const r of ob ?? []) {
        const k = r.fecha as string
        bultosPorDia.set(k, (bultosPorDia.get(k) ?? 0) + Number(r.bultos_total ?? 0))
      }
      const pk = statsPorDia(bultosPorDia)
      const capPicker = config.prod_bul_hh * config.horas_turno
      const pickeros: RolFte = {
        volumenProm: Math.round(pk.prom), volumenPico: Math.round(pk.pico), productividad: config.prod_bul_hh,
        diasConDatos: pk.dias,
        fteNecesariosProm: capPicker > 0 ? Math.ceil(pk.prom / capPicker) : 0,
        fteNecesariosPico: capPicker > 0 ? Math.ceil(pk.pico / capPicker) : 0,
        dotacion: config.dotacion_almacen,
      }

      // Maquinistas: pallets acarreo (recepcion_acarreos) + carga distribución (carga-camiones)
      const acarreoPorDia = new Map<string, number>()
      try {
        const acarreo = createAcarreoClient()
        if (acarreo) {
          const { data: rec } = await acarreo.from("recepcion_acarreos").select("fecha, pallets").gte("fecha", desde)
          for (const r of rec ?? []) {
            const k = r.fecha as string
            acarreoPorDia.set(k, (acarreoPorDia.get(k) ?? 0) + Number(r.pallets ?? 0))
          }
        }
      } catch {
        // acarreo-rdf no configurado → maquinistas solo con carga de distribución
      }
      const cargaPorDia = new Map<string, number>()
      for (const r of await fetchDepositoFilas("carga-camiones")) {
        const fch = String((r as { fecha?: string }).fecha ?? "")
        if (fch >= desde) cargaPorDia.set(fch, (cargaPorDia.get(fch) ?? 0) + Number((r as { pallets?: number }).pallets ?? 0))
      }
      const palPorDia = new Map<string, number>()
      const acaVals: number[] = [], cargaVals: number[] = []
      for (const fch of new Set([...acarreoPorDia.keys(), ...cargaPorDia.keys()])) {
        const aca = acarreoPorDia.get(fch) ?? 0
        const car = cargaPorDia.get(fch) ?? 0
        palPorDia.set(fch, aca + car * (1 + config.factor_retorno_distrib))
        acaVals.push(aca); cargaVals.push(car)
      }
      const mq = statsPorDia(palPorDia)
      const capMaq = config.prod_pal_h * config.horas_turno
      const avgArr = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0)
      const maquinistas = {
        volumenProm: Math.round(mq.prom), volumenPico: Math.round(mq.pico), productividad: config.prod_pal_h,
        diasConDatos: mq.dias,
        fteNecesariosProm: capMaq > 0 ? Math.ceil(mq.prom / capMaq) : 0,
        fteNecesariosPico: capMaq > 0 ? Math.ceil(mq.pico / capMaq) : 0,
        dotacion: config.dotacion_maquinistas,
        palAcarreoProm: avgArr(acaVals),
        palCargaProm: avgArr(cargaVals),
        factorRetorno: config.factor_retorno_distrib,
      }

      if (pk.dias > 0 || mq.dias > 0) almacen = { mes: mesAA, pickeros, maquinistas }
    } catch (e) {
      almacenError = e instanceof Error ? e.message : "Error almacén"
    }

    return {
      data: {
        config,
        objetivos,
        flota,
        capacidadInstaladaDiaria,
        unidadesDisponibles: disponibles.length,
        metricas,
        metricasError,
        almacen,
        almacenError,
        planes: (planesRes.data ?? []) as DimPlan[],
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ─── Mutaciones ───────────────────────────────────────────────────────────

export async function guardarCapacidadFlota(
  dominio: string,
  capacidadCeq: number,
  capacidadKg: number | null,
  activo: boolean,
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase.from("dim_flota_capacidad").upsert({
      dominio,
      capacidad_ceq: Math.max(0, Number(capacidadCeq) || 0),
      capacidad_kg: capacidadKg != null && Number.isFinite(capacidadKg) ? Math.max(0, capacidadKg) : null,
      activo,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function guardarConfigDim(config: DimConfig): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_config")
      .update({
        peso_kg_bulto: Math.max(0, Number(config.peso_kg_bulto) || 0),
        dias_operativos_mes: Math.max(1, Number(config.dias_operativos_mes) || 26),
        viajes_por_dia: Math.max(0.1, Number(config.viajes_por_dia) || 1),
        factor_ceq_bulto: Math.max(0.0001, Number(config.factor_ceq_bulto) || 1),
        prod_bul_hh: Math.max(1, Number(config.prod_bul_hh) || 300),
        horas_turno: Math.max(0.1, Number(config.horas_turno) || 8),
        dotacion_almacen: Math.max(0, Number(config.dotacion_almacen) || 0),
        prod_pal_h: Math.max(0.1, Number(config.prod_pal_h) || 15),
        dotacion_maquinistas: Math.max(0, Number(config.dotacion_maquinistas) || 0),
        factor_retorno_distrib: Math.max(0, Number(config.factor_retorno_distrib) || 0),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function guardarObjetivoKpi(kpi: string, objetivo: number): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_kpi_objetivos")
      .update({ objetivo: Number(objetivo) || 0, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("kpi", kpi)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function crearPlanDim(
  plan: Omit<DimPlan, "id" | "created_at" | "estado"> & { estado?: DimPlan["estado"] },
): Promise<Result<DimPlan>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    if (!plan.que?.trim()) return { error: "El 'Qué' es obligatorio." }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("dim_planes")
      .insert({
        que: plan.que.trim(),
        por_que: plan.por_que?.trim() || null,
        quien: plan.quien?.trim() || null,
        donde: plan.donde?.trim() || null,
        cuando: plan.cuando || null,
        como: plan.como?.trim() || null,
        cuanto: plan.cuanto?.trim() || null,
        estado: plan.estado ?? "pendiente",
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: data as DimPlan }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function actualizarEstadoPlanDim(
  id: string,
  estado: DimPlan["estado"],
): Promise<Result<true>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_planes")
      .update({ estado, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Recalcula el factor CEq/bulto desde chess-dashboard (mes anterior, sin envases) y lo guarda. */
export async function recalcularFactorCeq(): Promise<Result<FactorCeqResult>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const r = await fetchFactorCeq()
    if (!r || !r.factor) {
      return { error: "No se pudo calcular el factor desde chess-dashboard (¿PLANIFICADOR_API_KEY configurada?)." }
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from("dim_config")
      .update({ factor_ceq_bulto: r.factor, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: r }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export interface ProductividadReal {
  picking: { prod: number; dias: number } | null
  maquinistas: { prod: number; dias: number } | null
}

/** Trae el promedio real de productividad del mes (deposito-esteban) y lo guarda en config. */
export async function recalcularProductividadAlmacen(): Promise<Result<ProductividadReal>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const hoy = new Date()
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`

    const promedio = (filas: Record<string, unknown>[], campo: string): { prod: number; dias: number } | null => {
      const vals = filas
        .filter((r) => String(r.fecha ?? "") >= desde)
        .map((r) => Number(r[campo] ?? 0))
        .filter((v) => v > 0)
      if (!vals.length) return null
      return { prod: Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10, dias: vals.length }
    }

    const picking = promedio(await fetchDepositoFilas("productividad-picking"), "bul_hh")
    const maquinistas = promedio(await fetchDepositoFilas("productividad-maquinistas"), "pal_hh")
    if (!picking && !maquinistas) return { error: "deposito-esteban no devolvió productividad de este mes." }

    const patch: Record<string, unknown> = { updated_by: profile.id, updated_at: new Date().toISOString() }
    if (picking) patch.prod_bul_hh = picking.prod
    if (maquinistas) patch.prod_pal_h = maquinistas.prod

    const supabase = await createClient()
    const { error } = await supabase.from("dim_config").update(patch).eq("id", 1)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: { picking, maquinistas } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarPlanDim(id: string): Promise<Result<true>> {
  try {
    await requireRole(ROLES_EDICION)
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }
    const supabase = await createClient()
    const { error } = await supabase.from("dim_planes").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath("/planeamiento/dimensionamiento")
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

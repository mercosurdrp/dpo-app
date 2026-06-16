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
import { requireAuth, requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

type Result<T> = { data: T } | { error: string }

const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = ["admin", "admin_rrhh", "supervisor"]
const SOLO_PAMPEANA = "El dimensionamiento solo está disponible en Región Pampeana."

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface DimConfig {
  peso_kg_bulto: number
  dias_operativos_mes: number
  viajes_por_dia: number
  factor_ceq_bulto: number
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
        supabase.from("dim_config").select("peso_kg_bulto, dias_operativos_mes, viajes_por_dia, factor_ceq_bulto").eq("id", 1).maybeSingle(),
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

    return {
      data: {
        config,
        objetivos,
        flota,
        capacidadInstaladaDiaria,
        unidadesDisponibles: disponibles.length,
        metricas,
        metricasError,
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

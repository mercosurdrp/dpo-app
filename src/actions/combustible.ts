"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  RegistroCombustible,
  RendimientoSemanal,
  RendimientoMensual,
} from "@/types/database"

// ==================== CREAR REGISTRO ====================

interface CreateCombustibleInput {
  fecha: string
  dominio: string
  chofer: string
  odometro: number
  litros: number
  tipo_combustible?: string
  proveedor?: string
  numero_remito?: string
  costo_total?: number
  observaciones?: string
}

export async function createRegistroCombustible(
  input: CreateCombustibleInput
): Promise<{ data: RegistroCombustible } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Find previous record for same vehicle to calculate km_recorridos
    const { data: prevRecord } = await supabase
      .from("registro_combustible")
      .select("odometro")
      .eq("dominio", input.dominio.trim().toUpperCase())
      .lt("odometro", input.odometro)
      .order("odometro", { ascending: false })
      .limit(1)
      .single()

    let kmRecorridos: number | null = null
    let rendimiento: number | null = null

    if (prevRecord) {
      kmRecorridos = input.odometro - prevRecord.odometro
      if (input.litros > 0 && kmRecorridos > 0) {
        rendimiento = Math.round((kmRecorridos / input.litros) * 100) / 100
      }
    }

    const { data, error } = await supabase
      .from("registro_combustible")
      .insert({
        fecha: input.fecha,
        dominio: input.dominio.trim().toUpperCase(),
        chofer: input.chofer.trim().toUpperCase(),
        odometro: input.odometro,
        litros: input.litros,
        km_recorridos: kmRecorridos,
        rendimiento,
        tipo_combustible: input.tipo_combustible || "gasoil",
        proveedor: input.proveedor?.trim() || null,
        numero_remito: input.numero_remito?.trim() || null,
        costo_total: input.costo_total || null,
        observaciones: input.observaciones?.trim() || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as RegistroCombustible }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== LISTAR REGISTROS ====================

interface CombustibleFilter {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
  chofer?: string
  limit?: number
}

export async function getRegistrosCombustible(
  filters?: CombustibleFilter
): Promise<{ data: RegistroCombustible[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("registro_combustible")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.chofer) query = query.eq("chofer", filters.chofer)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as RegistroCombustible[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== UPDATE ====================

interface UpdateCombustibleInput {
  id: string
  fecha: string
  dominio: string
  chofer: string
  odometro: number
  litros: number
  tipo_combustible?: string | null
  proveedor?: string | null
  numero_remito?: string | null
  costo_total?: number | null
  observaciones?: string | null
}

export async function updateRegistroCombustible(
  input: UpdateCombustibleInput
): Promise<{ data: RegistroCombustible } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Recalcular km_recorridos + rendimiento en base al registro previo del
    // mismo vehículo (el que tiene odómetro inmediatamente menor, ignorando
    // el mismo registro que estoy editando).
    const { data: prev } = await supabase
      .from("registro_combustible")
      .select("odometro")
      .eq("dominio", input.dominio.trim().toUpperCase())
      .lt("odometro", input.odometro)
      .neq("id", input.id)
      .order("odometro", { ascending: false })
      .limit(1)
      .single()

    let kmRecorridos: number | null = null
    let rendimiento: number | null = null
    if (prev) {
      kmRecorridos = input.odometro - prev.odometro
      if (input.litros > 0 && kmRecorridos > 0) {
        rendimiento = Math.round((kmRecorridos / input.litros) * 100) / 100
      }
    }

    const { data, error } = await supabase
      .from("registro_combustible")
      .update({
        fecha: input.fecha,
        dominio: input.dominio.trim().toUpperCase(),
        chofer: input.chofer.trim().toUpperCase(),
        odometro: input.odometro,
        litros: input.litros,
        km_recorridos: kmRecorridos,
        rendimiento,
        tipo_combustible: input.tipo_combustible || "gasoil",
        proveedor: input.proveedor?.trim() || null,
        numero_remito: input.numero_remito?.trim() || null,
        costo_total: input.costo_total ?? null,
        observaciones: input.observaciones?.trim() || null,
      })
      .eq("id", input.id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as RegistroCombustible }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DELETE ====================

export async function deleteRegistroCombustible(
  id: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("registro_combustible")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== KPIs RENDIMIENTO ====================

export async function getRendimientoKpis(filters?: {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
}): Promise<{
  data: {
    totalCargas: number
    totalLitros: number
    totalKm: number
    promedioRendimiento: number
    promedioRendimientoL100: number
    semanal: RendimientoSemanal[]
    mensual: RendimientoMensual[]
    porVehiculo: {
      dominio: string
      cargas: number
      litros: number
      km: number
      rendimiento: number
    }[]
  }
} | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("registro_combustible")
      .select("*")
      .not("km_recorridos", "is", null)
      .not("rendimiento", "is", null)
      .order("fecha", { ascending: true })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)

    const { data, error } = await query
    if (error) return { error: error.message }

    const registros = (data || []) as RegistroCombustible[]

    if (registros.length === 0) {
      return {
        data: {
          totalCargas: 0,
          totalLitros: 0,
          totalKm: 0,
          promedioRendimiento: 0,
          promedioRendimientoL100: 0,
          semanal: [],
          mensual: [],
          porVehiculo: [],
        },
      }
    }

    const totalCargas = registros.length
    const totalLitros = registros.reduce((a, r) => a + Number(r.litros), 0)
    const totalKm = registros.reduce((a, r) => a + (r.km_recorridos || 0), 0)
    const promedioRendimiento =
      totalLitros > 0
        ? Math.round((totalKm / totalLitros) * 100) / 100
        : 0
    const promedioRendimientoL100 =
      totalKm > 0
        ? Math.round((totalLitros / totalKm) * 10000) / 100
        : 0

    // Group by week
    const semanalMap = new Map<string, { litros: number; km: number; cargas: number; year: number; semana: number }>()
    for (const r of registros) {
      const date = new Date(r.fecha + "T12:00:00")
      const startOfYear = new Date(date.getFullYear(), 0, 1)
      const diff = date.getTime() - startOfYear.getTime()
      const semana = Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7)
      const year = date.getFullYear()
      const key = `${year}-${semana}`
      if (!semanalMap.has(key)) semanalMap.set(key, { litros: 0, km: 0, cargas: 0, year, semana })
      const g = semanalMap.get(key)!
      g.litros += Number(r.litros)
      g.km += r.km_recorridos || 0
      g.cargas++
    }
    const semanal: RendimientoSemanal[] = Array.from(semanalMap.values()).map((g) => ({
      semana: g.semana,
      year: g.year,
      promedio_rendimiento: g.litros > 0 ? Math.round((g.km / g.litros) * 100) / 100 : 0,
      total_litros: Math.round(g.litros * 100) / 100,
      total_km: g.km,
      total_cargas: g.cargas,
    }))

    // Group by month
    const mensualMap = new Map<string, { litros: number; km: number; cargas: number; year: number; mes: number }>()
    for (const r of registros) {
      const d = new Date(r.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key)) mensualMap.set(key, { litros: 0, km: 0, cargas: 0, year, mes })
      const g = mensualMap.get(key)!
      g.litros += Number(r.litros)
      g.km += r.km_recorridos || 0
      g.cargas++
    }
    const mensual: RendimientoMensual[] = Array.from(mensualMap.values()).map((g) => ({
      mes: g.mes,
      year: g.year,
      promedio_rendimiento: g.litros > 0 ? Math.round((g.km / g.litros) * 100) / 100 : 0,
      total_litros: Math.round(g.litros * 100) / 100,
      total_km: g.km,
      total_cargas: g.cargas,
    }))

    // Group by vehicle
    const vehMap = new Map<string, { litros: number; km: number; cargas: number }>()
    for (const r of registros) {
      if (!vehMap.has(r.dominio)) vehMap.set(r.dominio, { litros: 0, km: 0, cargas: 0 })
      const g = vehMap.get(r.dominio)!
      g.litros += Number(r.litros)
      g.km += r.km_recorridos || 0
      g.cargas++
    }
    const porVehiculo = Array.from(vehMap.entries())
      .map(([dominio, g]) => ({
        dominio,
        cargas: g.cargas,
        litros: Math.round(g.litros * 100) / 100,
        km: g.km,
        rendimiento: g.litros > 0 ? Math.round((g.km / g.litros) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.rendimiento - a.rendimiento)

    return {
      data: {
        totalCargas,
        totalLitros: Math.round(totalLitros * 100) / 100,
        totalKm,
        promedioRendimiento,
        promedioRendimientoL100,
        semanal,
        mensual,
        porVehiculo,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

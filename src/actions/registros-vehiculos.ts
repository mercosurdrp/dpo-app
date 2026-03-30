"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  RegistroVehiculo,
  TipoRegistroVehiculo,
  CatalogoChofer,
  CatalogoVehiculo,
  TmlSemanal,
  TmlMensual,
} from "@/types/database"

const TML_META_MINUTOS = 30

function calcTml(hora: string, horaEntrada: number): number {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m - horaEntrada * 60
}

// ==================== CREAR REGISTRO ====================

interface CreateRegistroInput {
  tipo: TipoRegistroVehiculo
  fecha: string
  dominio: string
  chofer: string
  ayudante1?: string
  ayudante2?: string
  odometro?: number
  hora: string // "HH:MM"
  horaEntrada?: number // 6 o 7 (default 7)
  observaciones?: string
}

export async function createRegistroVehiculo(
  input: CreateRegistroInput
): Promise<{ data: RegistroVehiculo } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const horaEntrada = input.horaEntrada ?? 7
    const tml = input.tipo === "egreso" ? calcTml(input.hora, horaEntrada) : null

    // Calculate week number
    const date = new Date(input.fecha + "T12:00:00")
    const startOfYear = new Date(date.getFullYear(), 0, 1)
    const diff = date.getTime() - startOfYear.getTime()
    const semana = Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7)

    const { data, error } = await supabase
      .from("registros_vehiculos")
      .insert({
        tipo: input.tipo,
        fecha: input.fecha,
        dominio: input.dominio.trim().toUpperCase(),
        chofer: input.chofer.trim().toUpperCase(),
        ayudante1: input.ayudante1?.trim().toUpperCase() || null,
        ayudante2: input.ayudante2?.trim().toUpperCase() || null,
        odometro: input.odometro || null,
        hora: input.hora + ":00",
        semana,
        hora_entrada: horaEntrada,
        tml_minutos: tml,
        observaciones: input.observaciones?.trim() || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as RegistroVehiculo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== LISTAR REGISTROS ====================

interface RegistrosFilter {
  tipo?: TipoRegistroVehiculo
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
  chofer?: string
  semana?: number
  limit?: number
}

export async function getRegistrosVehiculos(
  filters?: RegistrosFilter
): Promise<{ data: RegistroVehiculo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("registros_vehiculos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false })

    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.chofer) query = query.eq("chofer", filters.chofer)
    if (filters?.semana) query = query.eq("semana", filters.semana)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as RegistroVehiculo[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DELETE REGISTRO ====================

export async function deleteRegistroVehiculo(
  id: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("registros_vehiculos")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== KPIs TML ====================

export async function getTmlKpis(filters?: {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
  chofer?: string
}): Promise<{
  data: {
    totalEgresos: number
    promedioTml: number
    dentroMeta: number
    pctDentroMeta: number
    metaMinutos: number
    semanal: TmlSemanal[]
    mensual: TmlMensual[]
  }
} | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("registros_vehiculos")
      .select("*")
      .eq("tipo", "egreso")
      .not("tml_minutos", "is", null)
      .order("fecha", { ascending: true })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.chofer) query = query.eq("chofer", filters.chofer)

    const { data, error } = await query
    if (error) return { error: error.message }

    const registros = (data || []) as RegistroVehiculo[]

    if (registros.length === 0) {
      return {
        data: {
          totalEgresos: 0,
          promedioTml: 0,
          dentroMeta: 0,
          pctDentroMeta: 0,
          metaMinutos: TML_META_MINUTOS,
          semanal: [],
          mensual: [],
        },
      }
    }

    // Global stats
    const tmls = registros.map((r) => r.tml_minutos!)
    const totalEgresos = tmls.length
    const promedioTml = Math.round(tmls.reduce((a, b) => a + b, 0) / totalEgresos)
    const dentroMeta = tmls.filter((t) => t <= TML_META_MINUTOS).length
    const pctDentroMeta = Math.round((dentroMeta / totalEgresos) * 100)

    // Group by week
    const semanalMap = new Map<string, { tmls: number[]; year: number; semana: number }>()
    for (const r of registros) {
      const year = new Date(r.fecha + "T12:00:00").getFullYear()
      const key = `${year}-${r.semana}`
      if (!semanalMap.has(key)) semanalMap.set(key, { tmls: [], year, semana: r.semana })
      semanalMap.get(key)!.tmls.push(r.tml_minutos!)
    }
    const semanal: TmlSemanal[] = Array.from(semanalMap.values()).map((g) => {
      const dm = g.tmls.filter((t) => t <= TML_META_MINUTOS).length
      return {
        semana: g.semana,
        year: g.year,
        promedio_tml: Math.round(g.tmls.reduce((a, b) => a + b, 0) / g.tmls.length),
        total_egresos: g.tmls.length,
        dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tmls.length) * 100),
      }
    })

    // Group by month
    const mensualMap = new Map<string, { tmls: number[]; year: number; mes: number }>()
    for (const r of registros) {
      const d = new Date(r.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key)) mensualMap.set(key, { tmls: [], year, mes })
      mensualMap.get(key)!.tmls.push(r.tml_minutos!)
    }
    const mensual: TmlMensual[] = Array.from(mensualMap.values()).map((g) => {
      const dm = g.tmls.filter((t) => t <= TML_META_MINUTOS).length
      return {
        mes: g.mes,
        year: g.year,
        promedio_tml: Math.round(g.tmls.reduce((a, b) => a + b, 0) / g.tmls.length),
        total_egresos: g.tmls.length,
        dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tmls.length) * 100),
      }
    })

    return {
      data: {
        totalEgresos,
        promedioTml,
        dentroMeta,
        pctDentroMeta,
        metaMinutos: TML_META_MINUTOS,
        semanal,
        mensual,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CATÁLOGOS ====================

export async function getChoferes(): Promise<{ data: CatalogoChofer[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("catalogo_choferes")
      .select("*")
      .eq("active", true)
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data || []) as CatalogoChofer[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getVehiculos(): Promise<{ data: CatalogoVehiculo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("catalogo_vehiculos")
      .select("*")
      .eq("active", true)
      .order("dominio")
    if (error) return { error: error.message }
    return { data: (data || []) as CatalogoVehiculo[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

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
  TmlMesComparado,
} from "@/types/database"

const MES_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

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

// ==================== UPDATE REGISTRO ====================

interface UpdateRegistroInput {
  id: string
  hora?: string // "HH:MM"
  dominio?: string
  chofer?: string
  ayudante1?: string | null
  ayudante2?: string | null
  odometro?: number | null
  horaEntrada?: number
  observaciones?: string | null
}

export async function updateRegistroVehiculo(
  input: UpdateRegistroInput
): Promise<{ data: RegistroVehiculo } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const updates: Record<string, unknown> = {}

    if (input.dominio !== undefined) updates.dominio = input.dominio.trim().toUpperCase()
    if (input.chofer !== undefined) updates.chofer = input.chofer.trim().toUpperCase()
    if (input.ayudante1 !== undefined) updates.ayudante1 = input.ayudante1?.trim().toUpperCase() || null
    if (input.ayudante2 !== undefined) updates.ayudante2 = input.ayudante2?.trim().toUpperCase() || null
    if (input.odometro !== undefined) updates.odometro = input.odometro
    if (input.observaciones !== undefined) updates.observaciones = input.observaciones?.trim() || null

    if (input.hora !== undefined) {
      updates.hora = input.hora + ":00"
      // Recalculate TML
      const horaEntrada = input.horaEntrada ?? 7
      updates.tml_minutos = calcTml(input.hora, horaEntrada)
      updates.hora_entrada = horaEntrada
    } else if (input.horaEntrada !== undefined) {
      // Need to recalc TML with existing hora — fetch current record
      const { data: current } = await supabase
        .from("registros_vehiculos")
        .select("hora")
        .eq("id", input.id)
        .single()
      if (current) {
        updates.hora_entrada = input.horaEntrada
        updates.tml_minutos = calcTml(current.hora.slice(0, 5), input.horaEntrada)
      }
    }

    const { data, error } = await supabase
      .from("registros_vehiculos")
      .update(updates)
      .eq("id", input.id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as RegistroVehiculo }
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
    promedioFte: number
    dentroMeta: number
    pctDentroMeta: number
    metaMinutos: number
    semanal: TmlSemanal[]
    mensual: TmlMensual[]
    comparadoYoY: TmlMesComparado[]
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
          promedioFte: 0,
          dentroMeta: 0,
          pctDentroMeta: 0,
          metaMinutos: TML_META_MINUTOS,
          semanal: [],
          mensual: [],
          comparadoYoY: [],
        },
      }
    }

    // Global stats
    const tmls = registros.map((r) => r.tml_minutos!)
    const totalEgresos = tmls.length
    const promedioTml = Math.round(tmls.reduce((a, b) => a + b, 0) / totalEgresos)
    const dentroMeta = tmls.filter((t) => t <= TML_META_MINUTOS).length
    const pctDentroMeta = Math.round((dentroMeta / totalEgresos) * 100)

    // FTE Promedio: 1 chofer + ayudantes por viaje, promediado sobre el total de viajes
    const totalFte = registros.reduce(
      (acc, r) => acc + 1 + (r.ayudante1 ? 1 : 0) + (r.ayudante2 ? 1 : 0),
      0,
    )
    const promedioFte = Math.round((totalFte / totalEgresos) * 100) / 100

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

    // YoY: últimos 12 meses calendario vs mismo mes año anterior
    const today = new Date()
    const ventana: Array<{ year: number; mes: number }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      ventana.push({ year: d.getFullYear(), mes: d.getMonth() + 1 })
    }
    const mensualByKey = new Map<string, TmlMensual>()
    for (const m of mensual) mensualByKey.set(`${m.year}-${m.mes}`, m)
    const comparadoYoY: TmlMesComparado[] = ventana.map(({ year, mes }) => {
      const cur = mensualByKey.get(`${year}-${mes}`)
      const prev = mensualByKey.get(`${year - 1}-${mes}`)
      const curTml = cur ? cur.promedio_tml : null
      const prevTml = prev ? prev.promedio_tml : null
      return {
        mes,
        mes_label: MES_LABELS[mes - 1],
        promedio_tml_actual: curTml,
        promedio_tml_anterior: prevTml,
        pct_dentro_meta_actual: cur ? cur.pct_dentro_meta : null,
        pct_dentro_meta_anterior: prev ? prev.pct_dentro_meta : null,
        delta_tml: curTml != null && prevTml != null ? curTml - prevTml : null,
      }
    })

    return {
      data: {
        totalEgresos,
        promedioTml,
        promedioFte,
        dentroMeta,
        pctDentroMeta,
        metaMinutos: TML_META_MINUTOS,
        semanal,
        mensual,
        comparadoYoY,
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

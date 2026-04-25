"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

// ---------- Types ----------

export interface ReunionCheckIn {
  id: string
  legajo: number
  fecha: string
  hora_checkin: string
  hora_fichaje: string | null
  minutos_fichaje_reunion: number | null
  created_at: string
}

export interface ReunionDiaria {
  legajo: number
  nombre: string
  sector: string
  hora_fichaje: string | null
  hora_checkin: string | null
  minutos_fichaje_reunion: number | null
  asistio: boolean
}

export interface ReunionKpis {
  fecha: string
  total_empleados: number
  asistieron: number
  pct_asistencia: number
  promedio_minutos: number | null
  detalle: ReunionDiaria[]
}

// ---------- checkInReunion ----------
// Empleado marca su asistencia a la reunión pre-ruta

export async function checkInReunion(): Promise<
  { data: { hora_checkin: string; minutos_fichaje_reunion: number | null } } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Get empleado by profile_id
    const { data: empleado } = await supabase
      .from("empleados")
      .select("legajo")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { error: "No se encontró tu legajo" }

    const hoy = new Date().toISOString().slice(0, 10)
    const ahora = new Date().toISOString()

    // Check if already checked in today
    const { data: existing } = await supabase
      .from("reunion_preruta")
      .select("id")
      .eq("legajo", empleado.legajo)
      .eq("fecha", hoy)
      .single()

    if (existing) return { error: "Ya marcaste asistencia hoy" }

    // Get biometric entry time for today
    const fechaDesde = `${hoy}T00:00:00`
    const fechaHasta = `${hoy}T23:59:59`

    const { data: marcas } = await supabase
      .from("asistencia_marcas")
      .select("fecha_marca")
      .eq("legajo", empleado.legajo)
      .eq("tipo_marca", "E")
      .gte("fecha_marca", fechaDesde)
      .lte("fecha_marca", fechaHasta)
      .order("fecha_marca")
      .limit(1)

    const horaFichaje = marcas && marcas.length > 0 ? marcas[0].fecha_marca : null

    // Calculate minutes between biometric entry and meeting check-in
    let minutosDiff: number | null = null
    if (horaFichaje) {
      const diff = new Date(ahora).getTime() - new Date(horaFichaje).getTime()
      minutosDiff = Math.round(diff / 60000)
    }

    // Insert check-in
    const { error } = await supabase
      .from("reunion_preruta")
      .insert({
        legajo: empleado.legajo,
        fecha: hoy,
        hora_checkin: ahora,
        hora_fichaje: horaFichaje,
        minutos_fichaje_reunion: minutosDiff,
      })

    if (error) return { error: error.message }

    return {
      data: {
        hora_checkin: ahora,
        minutos_fichaje_reunion: minutosDiff,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al marcar asistencia" }
  }
}

// ---------- getEstadoReunionHoy ----------
// Para el empleado: ¿ya marqué hoy?

export async function getEstadoReunionHoy(): Promise<
  { data: { marcado: boolean; hora_checkin: string | null; minutos: number | null } } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: empleado } = await supabase
      .from("empleados")
      .select("legajo")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { data: { marcado: false, hora_checkin: null, minutos: null } }

    const hoy = new Date().toISOString().slice(0, 10)

    const { data: checkin } = await supabase
      .from("reunion_preruta")
      .select("hora_checkin, minutos_fichaje_reunion")
      .eq("legajo", empleado.legajo)
      .eq("fecha", hoy)
      .single()

    if (!checkin) return { data: { marcado: false, hora_checkin: null, minutos: null } }

    return {
      data: {
        marcado: true,
        hora_checkin: checkin.hora_checkin,
        minutos: checkin.minutos_fichaje_reunion,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error consultando estado" }
  }
}

// ---------- getReunionKpis ----------
// Para el dashboard admin

export async function getReunionKpis(
  fecha: string
): Promise<{ data: ReunionKpis } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get all active empleados (sector Distribución only - they do pre-ruta)
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre")

    const empleadosArr = (empleados ?? []) as { legajo: number; nombre: string; sector: string }[]

    // Get check-ins for the date
    const { data: checkins } = await supabase
      .from("reunion_preruta")
      .select("*")
      .eq("fecha", fecha)

    const checkinMap = new Map<number, ReunionCheckIn>()
    for (const c of (checkins ?? []) as ReunionCheckIn[]) {
      checkinMap.set(c.legajo, c)
    }

    // Build detail
    const detalle: ReunionDiaria[] = empleadosArr.map((emp) => {
      const checkin = checkinMap.get(emp.legajo)
      return {
        legajo: emp.legajo,
        nombre: emp.nombre,
        sector: emp.sector ?? "Distribución",
        hora_fichaje: checkin?.hora_fichaje ?? null,
        hora_checkin: checkin?.hora_checkin ?? null,
        minutos_fichaje_reunion: checkin?.minutos_fichaje_reunion ?? null,
        asistio: !!checkin,
      }
    })

    const asistieron = detalle.filter((d) => d.asistio).length
    const conMinutos = detalle.filter((d) => d.minutos_fichaje_reunion !== null)
    const promedioMinutos = conMinutos.length > 0
      ? Math.round(conMinutos.reduce((s, d) => s + (d.minutos_fichaje_reunion ?? 0), 0) / conMinutos.length)
      : null

    return {
      data: {
        fecha,
        total_empleados: empleadosArr.length,
        asistieron,
        pct_asistencia: empleadosArr.length > 0 ? Math.round((asistieron / empleadosArr.length) * 100) : 0,
        promedio_minutos: promedioMinutos,
        detalle,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading KPIs" }
  }
}

// ---------- getReunionResumenMensual ----------

export interface ReunionResumenMensual {
  fecha: string
  total_empleados: number
  asistieron: number
  pct_asistencia: number
  promedio_minutos: number | null
}

export async function getReunionResumenMensual(
  mes: number,
  anio: number,
  sector?: string
): Promise<{ data: ReunionResumenMensual[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const fechaDesde = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const fechaHasta = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    // Get all check-ins for the month
    const { data: checkins } = await supabase
      .from("reunion_preruta")
      .select("*")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha")

    // Get active empleados (filtered by sector if provided)
    let empleadosQuery = supabase
      .from("empleados")
      .select("legajo, sector")
      .eq("activo", true)
    if (sector) empleadosQuery = empleadosQuery.eq("sector", sector)
    const { data: empleados } = await empleadosQuery

    const empleadosArr = (empleados ?? []) as { legajo: number; sector: string }[]
    const totalEmpleados = empleadosArr.length
    const legajosValidos = new Set(empleadosArr.map((e) => e.legajo))

    // Group by date, restricting check-ins to empleados within the sector
    const porFecha = new Map<string, ReunionCheckIn[]>()
    for (const c of (checkins ?? []) as ReunionCheckIn[]) {
      if (!legajosValidos.has(c.legajo)) continue
      const list = porFecha.get(c.fecha) ?? []
      list.push(c)
      porFecha.set(c.fecha, list)
    }

    const result: ReunionResumenMensual[] = []
    for (const [fecha, checks] of porFecha) {
      const conMinutos = checks.filter((c) => c.minutos_fichaje_reunion !== null)
      const promedio = conMinutos.length > 0
        ? Math.round(conMinutos.reduce((s, c) => s + Number(c.minutos_fichaje_reunion ?? 0), 0) / conMinutos.length)
        : null

      result.push({
        fecha,
        total_empleados: totalEmpleados,
        asistieron: checks.length,
        pct_asistencia: totalEmpleados > 0 ? Math.round((checks.length / totalEmpleados) * 100) : 0,
        promedio_minutos: promedio,
      })
    }

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading resumen" }
  }
}

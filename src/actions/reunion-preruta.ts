"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

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

// ---------- getAsistenciaRango ----------
// Dashboard de % asistencia a reunión matinal con filtros de período,
// sector y sucursal. Mirror estructural de getPuntualidadRango.

export type PeriodoAsistencia = "dia" | "semana" | "mes" | "ytd" | "personalizado"
export type SucursalAsistencia = "ELDORADO" | "IGUAZU"
// "TODAS" = sin segmentar; "ELDORADO" / "IGUAZU" = una sucursal (solo Misiones).
export type SucursalAsistenciaFiltro = "TODAS" | SucursalAsistencia

export interface AsistenciaFiltros {
  // true = solo empleados del sector "Distribución" (default).
  soloDistribucion: boolean
  sucursal: SucursalAsistenciaFiltro
}

// No se exporta: un archivo "use server" solo puede exportar funciones async.
const FILTROS_ASISTENCIA_DEFAULT: AsistenciaFiltros = {
  soloDistribucion: true,
  sucursal: "TODAS",
}

// Resumen de un día (un punto de la serie / gráfico).
export interface AsistenciaResumenDia {
  fecha: string
  total_empleados: number
  asistieron: number
  pct_asistencia: number
  promedio_minutos: number | null
}

// Resumen acumulado del período completo.
export interface AsistenciaResumen {
  total_empleados: number // empleados activos del filtro
  dias_con_reunion: number
  asistencias: number // empleado-días con check-in
  pct_asistencia: number
  promedio_minutos: number | null
}

// Detalle por empleado de un día puntual.
export interface AsistenciaDetalleDia {
  legajo: number
  nombre: string
  sector: string
  sucursal: SucursalAsistencia | null
  hora_fichaje: string | null
  hora_checkin: string | null
  minutos_fichaje_reunion: number | null
  asistio: boolean
}

// Agregado por empleado para rangos multi-día.
export interface AsistenciaEmpleadoAgg {
  legajo: number
  nombre: string
  sector: string
  sucursal: SucursalAsistencia | null
  dias_con_reunion: number
  dias_asistio: number
  pct_asistencia: number
}

export interface AsistenciaRango {
  periodo: PeriodoAsistencia
  desde: string
  hasta: string
  resumen: AsistenciaResumen
  serie_diaria: AsistenciaResumenDia[]
  // Poblado solo cuando el rango es un único día (desde === hasta).
  detalle_dia: AsistenciaDetalleDia[]
  // Agregado por empleado del rango completo (cualquier período).
  detalle_empleados: AsistenciaEmpleadoAgg[]
}

// Pagina cualquier query de Supabase para sortear el límite de 1000 filas
// de PostgREST (un rango YTD de check-ins lo supera holgadamente).
async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function getAsistenciaRango(
  desde: string,
  hasta: string,
  periodo: PeriodoAsistencia = "mes",
  filtros: AsistenciaFiltros = FILTROS_ASISTENCIA_DEFAULT,
): Promise<{ data: AsistenciaRango } | { error: string }> {
  try {
    const re = /^\d{4}-\d{2}-\d{2}$/
    if (!re.test(desde) || !re.test(hasta)) {
      return { error: "Rango de fechas inválido" }
    }
    // Saneo: desde ≤ hasta.
    let d = desde
    let h = hasta
    if (d > h) [d, h] = [h, d]

    const supabase = await createClient()

    // Empleados activos, aplicando los filtros de sector / sucursal.
    // La columna `sucursal` solo existe en la DB de Misiones.
    let empQuery = supabase
      .from("empleados")
      .select(
        IS_MISIONES ? "legajo, nombre, sector, sucursal" : "legajo, nombre, sector",
      )
      .eq("activo", true)
      .order("nombre")

    if (filtros.soloDistribucion) empQuery = empQuery.eq("sector", "Distribución")
    if (IS_MISIONES && filtros.sucursal !== "TODAS") {
      empQuery = empQuery.eq("sucursal", filtros.sucursal)
    }

    const { data: empleados, error: empErr } = await empQuery
    if (empErr) return { error: empErr.message }

    const empleadosArr = (empleados ?? []) as unknown as {
      legajo: number
      nombre: string
      sector: string | null
      sucursal?: SucursalAsistencia | null
    }[]
    const empMap = new Map(empleadosArr.map((e) => [e.legajo, e]))
    const totalEmpleados = empleadosArr.length

    // Check-ins del rango (paginados — un rango YTD supera 1000 filas).
    const checkins = await fetchAllRows<ReunionCheckIn>((from, to) =>
      supabase
        .from("reunion_preruta")
        .select("*")
        .gte("fecha", d)
        .lte("fecha", h)
        .order("fecha")
        .range(from, to),
    )

    // Agrupar por fecha, restringiendo los check-ins a empleados del filtro.
    const porFecha = new Map<string, ReunionCheckIn[]>()
    for (const c of checkins) {
      if (!empMap.has(c.legajo)) continue
      const list = porFecha.get(c.fecha) ?? []
      list.push(c)
      porFecha.set(c.fecha, list)
    }

    // Serie diaria + acumulado del período + agregado por empleado.
    const serie: AsistenciaResumenDia[] = []
    let asistAcum = 0
    let minutosAcum = 0
    let minutosCount = 0
    const aggEmp = new Map<number, number>() // legajo → días asistidos

    for (const fecha of [...porFecha.keys()].sort()) {
      const checks = porFecha.get(fecha)!
      const conMin = checks.filter((c) => c.minutos_fichaje_reunion !== null)
      const promedio =
        conMin.length > 0
          ? Math.round(
              conMin.reduce(
                (s, c) => s + Number(c.minutos_fichaje_reunion ?? 0),
                0,
              ) / conMin.length,
            )
          : null
      serie.push({
        fecha,
        total_empleados: totalEmpleados,
        asistieron: checks.length,
        pct_asistencia:
          totalEmpleados > 0
            ? Math.round((checks.length / totalEmpleados) * 100)
            : 0,
        promedio_minutos: promedio,
      })
      asistAcum += checks.length
      for (const c of checks) {
        aggEmp.set(c.legajo, (aggEmp.get(c.legajo) ?? 0) + 1)
        if (c.minutos_fichaje_reunion !== null) {
          minutosAcum += Number(c.minutos_fichaje_reunion)
          minutosCount++
        }
      }
    }

    const diasConReunion = serie.length

    // Agregado por empleado del rango completo (cualquier período).
    const detalleEmpleados: AsistenciaEmpleadoAgg[] = empleadosArr.map((e) => {
      const dias = aggEmp.get(e.legajo) ?? 0
      return {
        legajo: e.legajo,
        nombre: e.nombre,
        sector: e.sector ?? "Distribución",
        sucursal: e.sucursal ?? null,
        dias_con_reunion: diasConReunion,
        dias_asistio: dias,
        pct_asistencia:
          diasConReunion > 0 ? Math.round((dias / diasConReunion) * 100) : 0,
      }
    })
    // Peores primero — surface a los empleados con más ausencias.
    detalleEmpleados.sort(
      (x, y) =>
        x.pct_asistencia - y.pct_asistencia || x.nombre.localeCompare(y.nombre),
    )

    // Detalle del día (solo si el rango es un único día).
    const detalleDia: AsistenciaDetalleDia[] = []
    if (d === h) {
      const checks = porFecha.get(d) ?? []
      const checkMap = new Map(checks.map((c) => [c.legajo, c]))
      for (const e of empleadosArr) {
        const c = checkMap.get(e.legajo)
        detalleDia.push({
          legajo: e.legajo,
          nombre: e.nombre,
          sector: e.sector ?? "Distribución",
          sucursal: e.sucursal ?? null,
          hora_fichaje: c?.hora_fichaje ?? null,
          hora_checkin: c?.hora_checkin ?? null,
          minutos_fichaje_reunion: c?.minutos_fichaje_reunion ?? null,
          asistio: !!c,
        })
      }
      detalleDia.sort((x, y) => {
        if (x.asistio !== y.asistio) return x.asistio ? -1 : 1
        return x.nombre.localeCompare(y.nombre)
      })
    }

    return {
      data: {
        periodo,
        desde: d,
        hasta: h,
        resumen: {
          total_empleados: totalEmpleados,
          dias_con_reunion: diasConReunion,
          asistencias: asistAcum,
          pct_asistencia:
            totalEmpleados > 0 && diasConReunion > 0
              ? Math.round(
                  (asistAcum / (totalEmpleados * diasConReunion)) * 100,
                )
              : 0,
          promedio_minutos:
            minutosCount > 0 ? Math.round(minutosAcum / minutosCount) : null,
        },
        serie_diaria: serie,
        detalle_dia: detalleDia,
        detalle_empleados: detalleEmpleados,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando asistencia",
    }
  }
}

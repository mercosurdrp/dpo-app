"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { MarcaAsistencia } from "./asistencia"

function ajustarArgentina(fecha: string): string {
  return new Date(fecha).toISOString()
}

export interface MiFichajeHoy {
  entrada: string | null
  salida: string | null
  horas_trabajadas: number | null
}

export interface MiResumenMes {
  dias_trabajados: number
  horas_totales: number
  promedio_horas: number
  tardanzas: number
  dias_laborales: number
}

export interface MiFichajeHistorial {
  fecha: string
  entrada: string | null
  salida: string | null
  horas_trabajadas: number | null
}

export interface MiDashboardData {
  fichaje_hoy: MiFichajeHoy
  resumen_mes: MiResumenMes
  historial: MiFichajeHistorial[]
  legajo: number
  nombre: string
}

export async function getMiDashboard(): Promise<
  { data: MiDashboardData } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Get empleado
    const { data: empleado } = await supabase
      .from("empleados")
      .select("legajo, nombre")
      .eq("profile_id", profile.id)
      .single()

    if (!empleado) return { error: "No se encontró tu legajo" }

    const hoy = new Date().toISOString().slice(0, 10)
    const mes = new Date().getMonth() + 1
    const anio = new Date().getFullYear()

    // === FICHAJE HOY ===
    const fechaDesdeHoy = `${hoy}T00:00:00`
    const fechaHastaHoy = `${hoy}T23:59:59`

    const { data: marcasHoy } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .eq("legajo", empleado.legajo)
      .gte("fecha_marca", fechaDesdeHoy)
      .lte("fecha_marca", fechaHastaHoy)
      .order("fecha_marca")

    const marcasHoyArr = (marcasHoy ?? []) as MarcaAsistencia[]
    const entradasHoy = marcasHoyArr.filter((m) => m.tipo_marca === "E")
    const salidasHoy = marcasHoyArr.filter((m) => m.tipo_marca === "S")

    const entradaHoy = entradasHoy.length > 0 ? ajustarArgentina(entradasHoy[0].fecha_marca) : null
    const salidaHoy = salidasHoy.length > 0 ? ajustarArgentina(salidasHoy[salidasHoy.length - 1].fecha_marca) : null

    let horasHoy: number | null = null
    if (entradaHoy && salidaHoy) {
      const diff = new Date(salidaHoy).getTime() - new Date(entradaHoy).getTime()
      horasHoy = Math.round((diff / 3600000) * 100) / 100
    }

    // === RESUMEN MES ===
    const fechaDesdeMes = `${anio}-${String(mes).padStart(2, "0")}-01T00:00:00`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const fechaHastaMes = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}T23:59:59`

    const { data: marcasMes } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .eq("legajo", empleado.legajo)
      .gte("fecha_marca", fechaDesdeMes)
      .lte("fecha_marca", fechaHastaMes)
      .order("fecha_marca")

    const marcasMesArr = (marcasMes ?? []) as MarcaAsistencia[]

    // Group by date
    const porFecha = new Map<string, MarcaAsistencia[]>()
    for (const m of marcasMesArr) {
      const fecha = m.fecha_marca.slice(0, 10)
      const list = porFecha.get(fecha) ?? []
      list.push(m)
      porFecha.set(fecha, list)
    }

    let diasTrabajados = 0
    let horasTotales = 0
    let tardanzas = 0

    // Count business days (Mon-Sat)
    let diasLaborales = 0
    for (let d = 1; d <= ultimoDia; d++) {
      const dayOfWeek = new Date(anio, mes - 1, d).getDay()
      if (dayOfWeek !== 0) diasLaborales++
    }

    for (const [, marcasDia] of porFecha) {
      const entradas = marcasDia.filter((m) => m.tipo_marca === "E")
      const salidas = marcasDia.filter((m) => m.tipo_marca === "S")

      if (entradas.length > 0) {
        diasTrabajados++

        // Hora Argentina = UTC-3, así que 8:10 AR = 11:10 UTC
        const primeraEntrada = new Date(entradas[0].fecha_marca)
        const hUTC = primeraEntrada.getUTCHours()
        const mUTC = primeraEntrada.getUTCMinutes()
        if (hUTC > 11 || (hUTC === 11 && mUTC > 10)) {
          tardanzas++
        }

        if (salidas.length > 0) {
          const ultimaSalida = new Date(ajustarArgentina(salidas[salidas.length - 1].fecha_marca))
          const diff = ultimaSalida.getTime() - primeraEntrada.getTime()
          horasTotales += diff / 3600000
        }
      }
    }

    // === HISTORIAL 7 DÍAS ===
    const hace7 = new Date()
    hace7.setDate(hace7.getDate() - 7)
    const fechaDesde7 = hace7.toISOString().slice(0, 10) + "T00:00:00"

    const { data: marcas7 } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .eq("legajo", empleado.legajo)
      .gte("fecha_marca", fechaDesde7)
      .lte("fecha_marca", fechaHastaHoy)
      .order("fecha_marca")

    const marcas7Arr = (marcas7 ?? []) as MarcaAsistencia[]
    const porFecha7 = new Map<string, MarcaAsistencia[]>()
    for (const m of marcas7Arr) {
      const fecha = m.fecha_marca.slice(0, 10)
      const list = porFecha7.get(fecha) ?? []
      list.push(m)
      porFecha7.set(fecha, list)
    }

    const historial: MiFichajeHistorial[] = []
    // Last 7 days in reverse order
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const fecha = d.toISOString().slice(0, 10)
      const marcasDia = porFecha7.get(fecha) ?? []
      const entradas = marcasDia.filter((m) => m.tipo_marca === "E")
      const salidas = marcasDia.filter((m) => m.tipo_marca === "S")

      const entrada = entradas.length > 0 ? ajustarArgentina(entradas[0].fecha_marca) : null
      const salida = salidas.length > 0 ? ajustarArgentina(salidas[salidas.length - 1].fecha_marca) : null

      let horas: number | null = null
      if (entrada && salida) {
        const diff = new Date(salida).getTime() - new Date(entrada).getTime()
        horas = Math.round((diff / 3600000) * 100) / 100
      }

      historial.push({ fecha, entrada, salida, horas_trabajadas: horas })
    }

    return {
      data: {
        legajo: empleado.legajo,
        nombre: empleado.nombre,
        fichaje_hoy: {
          entrada: entradaHoy,
          salida: salidaHoy,
          horas_trabajadas: horasHoy,
        },
        resumen_mes: {
          dias_trabajados: diasTrabajados,
          horas_totales: Math.round(horasTotales * 100) / 100,
          promedio_horas: diasTrabajados > 0 ? Math.round((horasTotales / diasTrabajados) * 100) / 100 : 0,
          tardanzas,
          dias_laborales: diasLaborales,
        },
        historial,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando datos" }
  }
}

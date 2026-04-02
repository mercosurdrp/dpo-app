"use server"

import { createClient } from "@/lib/supabase/server"

// ---------- Types ----------

export interface PuntualidadDetalle {
  legajo: number
  nombre: string
  sector: string
  primera_entrada: string | null  // ISO string UTC
  puntual: boolean
}

export interface PuntualidadDiaria {
  fecha: string
  total_ficharon: number
  puntuales: number
  pct_puntualidad: number
  detalle: PuntualidadDetalle[]
}

export interface PuntualidadResumenDia {
  fecha: string
  total_ficharon: number
  puntuales: number
  pct_puntualidad: number
}

// 07:00 Argentina = 10:00 UTC
const HORA_CORTE_UTC = 10

// ---------- getPuntualidadDiaria ----------

export async function getPuntualidadDiaria(
  fecha: string
): Promise<{ data: PuntualidadDiaria } | { error: string }> {
  try {
    const supabase = await createClient()

    // Rango UTC del día Argentina: 03:00 UTC del día hasta 03:00 UTC del día siguiente
    const fechaDesde = `${fecha}T03:00:00+00:00`
    const fechaHastaDt = new Date(`${fecha}T03:00:00Z`)
    fechaHastaDt.setDate(fechaHastaDt.getDate() + 1)
    const fechaHasta = fechaHastaDt.toISOString()

    // Get all entry marks for the date (only tipo_marca = 'E')
    const { data: marcas, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("legajo, fecha_marca")
      .eq("tipo_marca", "E")
      .gte("fecha_marca", fechaDesde)
      .lt("fecha_marca", fechaHasta)
      .order("fecha_marca")

    if (marcasErr) return { error: marcasErr.message }

    const marcasArr = (marcas ?? []) as { legajo: number; fecha_marca: string }[]

    // Get all active empleados
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre")

    const empleadosArr = (empleados ?? []) as { legajo: number; nombre: string; sector: string }[]
    const empMap = new Map(empleadosArr.map((e) => [e.legajo, e]))

    // Group marcas by legajo — keep only first entry per legajo
    const primeraEntrada = new Map<number, string>()
    for (const m of marcasArr) {
      if (!primeraEntrada.has(m.legajo)) {
        primeraEntrada.set(m.legajo, m.fecha_marca)
      }
    }

    // Build detail: only employees who actually clocked in
    const detalle: PuntualidadDetalle[] = []
    let puntuales = 0

    for (const [legajo, fechaMarca] of primeraEntrada) {
      const emp = empMap.get(legajo)
      if (!emp) continue // skip unknown employees

      const dt = new Date(fechaMarca)
      const horaUTC = dt.getUTCHours()
      const minUTC = dt.getUTCMinutes()
      const esPuntual = horaUTC < HORA_CORTE_UTC || (horaUTC === HORA_CORTE_UTC && minUTC === 0)

      if (esPuntual) puntuales++

      detalle.push({
        legajo,
        nombre: emp.nombre,
        sector: emp.sector ?? "Distribucion",
        primera_entrada: fechaMarca,
        puntual: esPuntual,
      })
    }

    // Sort: puntuales first, then by name
    detalle.sort((a, b) => {
      if (a.puntual !== b.puntual) return a.puntual ? -1 : 1
      return a.nombre.localeCompare(b.nombre)
    })

    const totalFicharon = detalle.length
    const pct = totalFicharon > 0 ? Math.round((puntuales / totalFicharon) * 100) : 0

    return {
      data: {
        fecha,
        total_ficharon: totalFicharon,
        puntuales,
        pct_puntualidad: pct,
        detalle,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading puntualidad diaria" }
  }
}

// ---------- getPuntualidadMensual ----------

export async function getPuntualidadMensual(
  mes: number,
  anio: number
): Promise<{ data: PuntualidadResumenDia[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Rango UTC para el mes completo en Argentina
    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const fechaDesde = `${primerDia}T03:00:00+00:00`

    const ultimoDia = new Date(anio, mes, 0).getDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`
    const fechaHastaDt = new Date(`${ultimaFecha}T03:00:00Z`)
    fechaHastaDt.setDate(fechaHastaDt.getDate() + 1)
    const fechaHasta = fechaHastaDt.toISOString()

    // Get all entry marks for the month
    const { data: marcas, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("legajo, fecha_marca")
      .eq("tipo_marca", "E")
      .gte("fecha_marca", fechaDesde)
      .lt("fecha_marca", fechaHasta)
      .order("fecha_marca")

    if (marcasErr) return { error: marcasErr.message }

    const marcasArr = (marcas ?? []) as { legajo: number; fecha_marca: string }[]

    // Get active empleados for filtering
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo")
      .eq("activo", true)

    const activeLegajos = new Set((empleados ?? []).map((e: { legajo: number }) => e.legajo))

    // Group by Argentina date, then by legajo — keep first entry
    // Argentina date = UTC date shifted by -3h
    const porDia = new Map<string, Map<number, string>>() // fecha -> legajo -> primera marca

    for (const m of marcasArr) {
      if (!activeLegajos.has(m.legajo)) continue

      // Compute Argentina date from UTC timestamp
      const dt = new Date(m.fecha_marca)
      const argDt = new Date(dt.getTime() - 3 * 3600000)
      const fechaArg = argDt.toISOString().slice(0, 10)

      if (!porDia.has(fechaArg)) {
        porDia.set(fechaArg, new Map())
      }
      const diaMap = porDia.get(fechaArg)!
      if (!diaMap.has(m.legajo)) {
        diaMap.set(m.legajo, m.fecha_marca)
      }
    }

    // Build daily summaries
    const result: PuntualidadResumenDia[] = []

    const sortedDates = [...porDia.keys()].sort()
    for (const fecha of sortedDates) {
      const diaMap = porDia.get(fecha)!
      let puntuales = 0
      let totalFicharon = 0

      for (const [, fechaMarca] of diaMap) {
        totalFicharon++
        const dt = new Date(fechaMarca)
        const horaUTC = dt.getUTCHours()
        const minUTC = dt.getUTCMinutes()
        const esPuntual = horaUTC < HORA_CORTE_UTC || (horaUTC === HORA_CORTE_UTC && minUTC === 0)
        if (esPuntual) puntuales++
      }

      result.push({
        fecha,
        total_ficharon: totalFicharon,
        puntuales,
        pct_puntualidad: totalFicharon > 0 ? Math.round((puntuales / totalFicharon) * 100) : 0,
      })
    }

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading puntualidad mensual" }
  }
}

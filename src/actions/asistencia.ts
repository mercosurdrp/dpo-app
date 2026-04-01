"use server"

import { createClient } from "@/lib/supabase/server"

// ---------- Types ----------

export interface MarcaAsistencia {
  id: string
  codigo_empresa: string
  legajo: number
  fecha_marca: string
  tipo_marca: "E" | "S"
  reloj_marca: string | null
  created_at: string
}

export interface ResumenDiarioEmpleado {
  legajo: number
  nombre: string
  fecha: string
  primera_entrada: string | null
  ultima_salida: string | null
  horas_trabajadas: number | null
  marcas: MarcaAsistencia[]
}

export interface ResumenMensualEmpleado {
  legajo: number
  nombre: string
  dias_trabajados: number
  horas_totales: number
  promedio_horas: number
  tardanzas: number
  ausencias: number
}

// ---------- getMarcasDiarias ----------

export async function getMarcasDiarias(
  fecha: string
): Promise<{ data: ResumenDiarioEmpleado[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get all marcas for the date
    const fechaDesde = `${fecha}T00:00:00`
    const fechaHasta = `${fecha}T23:59:59`

    const { data: marcas, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .gte("fecha_marca", fechaDesde)
      .lte("fecha_marca", fechaHasta)
      .order("fecha_marca")

    if (marcasErr) return { error: marcasErr.message }

    const marcasArr = (marcas ?? []) as MarcaAsistencia[]

    // Get all empleados
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre")
      .eq("activo", true)
      .order("nombre")

    const empleadosArr = empleados ?? []

    // Group marcas by legajo
    const marcasPorLegajo = new Map<number, MarcaAsistencia[]>()
    for (const m of marcasArr) {
      const list = marcasPorLegajo.get(m.legajo) ?? []
      list.push(m)
      marcasPorLegajo.set(m.legajo, list)
    }

    // Build resumen for each empleado
    const result: ResumenDiarioEmpleado[] = empleadosArr.map((emp) => {
      const marcasEmp = marcasPorLegajo.get(emp.legajo) ?? []
      const entradas = marcasEmp.filter((m) => m.tipo_marca === "E")
      const salidas = marcasEmp.filter((m) => m.tipo_marca === "S")

      const primeraEntrada = entradas.length > 0 ? entradas[0].fecha_marca : null
      const ultimaSalida = salidas.length > 0 ? salidas[salidas.length - 1].fecha_marca : null

      let horasTrabajadas: number | null = null
      if (primeraEntrada && ultimaSalida) {
        const diff = new Date(ultimaSalida).getTime() - new Date(primeraEntrada).getTime()
        horasTrabajadas = Math.round((diff / 3600000) * 100) / 100
      }

      return {
        legajo: emp.legajo,
        nombre: emp.nombre,
        fecha,
        primera_entrada: primeraEntrada,
        ultima_salida: ultimaSalida,
        horas_trabajadas: horasTrabajadas,
        marcas: marcasEmp,
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading marcas" }
  }
}

// ---------- getResumenMensual ----------

export async function getResumenMensual(
  mes: number,
  anio: number,
  horaEntradaEsperada: number = 8 // hora esperada de entrada (8:00)
): Promise<{ data: ResumenMensualEmpleado[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const fechaDesde = `${anio}-${String(mes).padStart(2, "0")}-01T00:00:00`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const fechaHasta = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}T23:59:59`

    // Get all marcas for the month
    const { data: marcas, error: marcasErr } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .gte("fecha_marca", fechaDesde)
      .lte("fecha_marca", fechaHasta)
      .order("fecha_marca")

    if (marcasErr) return { error: marcasErr.message }

    const marcasArr = (marcas ?? []) as MarcaAsistencia[]

    // Get all empleados
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre")
      .eq("activo", true)
      .order("nombre")

    const empleadosArr = empleados ?? []

    // Count business days in the month (Mon-Sat)
    let diasLaborales = 0
    for (let d = 1; d <= ultimoDia; d++) {
      const dayOfWeek = new Date(anio, mes - 1, d).getDay()
      if (dayOfWeek !== 0) diasLaborales++ // exclude Sundays
    }

    // Group marcas by legajo then by date
    const marcasPorLegajo = new Map<number, Map<string, MarcaAsistencia[]>>()
    for (const m of marcasArr as MarcaAsistencia[]) {
      const fecha = m.fecha_marca.slice(0, 10)
      if (!marcasPorLegajo.has(m.legajo)) {
        marcasPorLegajo.set(m.legajo, new Map())
      }
      const porFecha = marcasPorLegajo.get(m.legajo)!
      const list = porFecha.get(fecha) ?? []
      list.push(m)
      porFecha.set(fecha, list)
    }

    const result: ResumenMensualEmpleado[] = empleadosArr.map((emp) => {
      const porFecha = marcasPorLegajo.get(emp.legajo) ?? new Map()

      let diasTrabajados = 0
      let horasTotales = 0
      let tardanzas = 0

      for (const [, marcasDia] of porFecha) {
        const entradas = marcasDia.filter((m: MarcaAsistencia) => m.tipo_marca === "E")
        const salidas = marcasDia.filter((m: MarcaAsistencia) => m.tipo_marca === "S")

        if (entradas.length > 0) {
          diasTrabajados++

          // Check tardanza
          const primeraEntrada = new Date(entradas[0].fecha_marca)
          if (primeraEntrada.getHours() > horaEntradaEsperada ||
              (primeraEntrada.getHours() === horaEntradaEsperada && primeraEntrada.getMinutes() > 10)) {
            tardanzas++
          }

          // Calculate hours
          if (salidas.length > 0) {
            const ultimaSalida = new Date(salidas[salidas.length - 1].fecha_marca)
            const diff = ultimaSalida.getTime() - primeraEntrada.getTime()
            horasTotales += diff / 3600000
          }
        }
      }

      return {
        legajo: emp.legajo,
        nombre: emp.nombre,
        dias_trabajados: diasTrabajados,
        horas_totales: Math.round(horasTotales * 100) / 100,
        promedio_horas: diasTrabajados > 0
          ? Math.round((horasTotales / diasTrabajados) * 100) / 100
          : 0,
        tardanzas,
        ausencias: Math.max(0, diasLaborales - diasTrabajados),
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading resumen" }
  }
}

// ---------- getUltimasMarcas ----------

export async function getUltimasMarcas(
  limit: number = 50
): Promise<{ data: (MarcaAsistencia & { nombre_empleado: string })[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: marcas, error } = await supabase
      .from("asistencia_marcas")
      .select("*")
      .order("fecha_marca", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message }

    const marcasArr = (marcas ?? []) as MarcaAsistencia[]

    // Get employee names
    const legajos = [...new Set(marcasArr.map((m) => m.legajo))]
    const { data: empleados } = await supabase
      .from("empleados")
      .select("legajo, nombre")
      .in("legajo", legajos)

    const nombreMap = new Map<number, string>()
    for (const e of empleados ?? []) {
      nombreMap.set(e.legajo, e.nombre)
    }

    const result = marcasArr.map((m) => ({
      ...m,
      nombre_empleado: nombreMap.get(m.legajo) ?? `Legajo ${m.legajo}`,
    }))

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading marcas" }
  }
}

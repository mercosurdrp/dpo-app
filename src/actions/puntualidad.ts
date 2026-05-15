"use server"

import { createClient } from "@/lib/supabase/server"
import { IS_MISIONES } from "@/lib/empresa"

// ---------- Types ----------

export type Sucursal = "ELDORADO" | "IGUAZU"
export type SucursalFiltro = "TODAS" | Sucursal
export type PeriodoPuntualidad = "dia" | "semana" | "mes" | "ytd" | "personalizado"

export interface PuntualidadFiltros {
  // true = solo empleados del sector "Distribución" (default).
  soloDistribucion: boolean
  // "TODAS" = sin segmentar; "ELDORADO" / "IGUAZU" = una sucursal (solo Misiones).
  sucursal: SucursalFiltro
}

// No se exporta: un archivo "use server" solo puede exportar funciones async.
const FILTROS_DEFAULT: PuntualidadFiltros = {
  soloDistribucion: true,
  sucursal: "TODAS",
}

// Detalle por empleado de un día puntual (con hora de entrada).
export interface PuntualidadDetalle {
  legajo: number
  nombre: string
  sector: string
  sucursal: Sucursal | null
  primera_entrada: string | null // ISO string UTC
  puntual: boolean
}

// Agregado por empleado para rangos multi-día.
export interface PuntualidadEmpleadoAgg {
  legajo: number
  nombre: string
  sector: string
  sucursal: Sucursal | null
  dias_ficho: number
  dias_puntual: number
  pct_puntualidad: number
}

// Resumen de un día (un punto de la serie / gráfico).
export interface PuntualidadResumenDia {
  fecha: string
  total_ficharon: number
  puntuales: number
  pct_puntualidad: number
}

// Resumen acumulado del período completo.
export interface PuntualidadResumen {
  total_ficharon: number // empleado-días con marca de entrada
  puntuales: number
  pct_puntualidad: number
}

export interface PuntualidadRango {
  periodo: PeriodoPuntualidad
  desde: string
  hasta: string
  resumen: PuntualidadResumen
  serie_diaria: PuntualidadResumenDia[]
  // Poblado solo cuando el rango es un único día (desde === hasta).
  detalle_dia: PuntualidadDetalle[]
  // Agregado por empleado del rango completo (cualquier período).
  detalle_empleados: PuntualidadEmpleadoAgg[]
}

// ---------- Helpers ----------

// 07:00 Argentina = 10:00 UTC (las marcas de Misiones están en UTC verdadero).
const HORA_CORTE_UTC = 10

// Pagina cualquier query de Supabase para sortear el límite de 1000 filas
// de PostgREST. `build` recibe el rango [from, to] y devuelve la query.
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

// ¿La primera entrada fue puntual? (≤ 07:00 AR)
function esPuntualMarca(iso: string): boolean {
  const dt = new Date(iso)
  const h = dt.getUTCHours()
  const m = dt.getUTCMinutes()
  return h < HORA_CORTE_UTC || (h === HORA_CORTE_UTC && m === 0)
}

// Fecha Argentina (YYYY-MM-DD) de un timestamp UTC.
function fechaArg(iso: string): string {
  const dt = new Date(iso)
  return new Date(dt.getTime() - 3 * 3600000).toISOString().slice(0, 10)
}

// ---------- getPuntualidadRango ----------

export async function getPuntualidadRango(
  desde: string,
  hasta: string,
  periodo: PeriodoPuntualidad = "mes",
  filtros: PuntualidadFiltros = FILTROS_DEFAULT,
): Promise<{ data: PuntualidadRango } | { error: string }> {
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
      .select(IS_MISIONES ? "legajo, nombre, sector, sucursal" : "legajo, nombre, sector")
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
      sucursal?: Sucursal | null
    }[]
    const empMap = new Map(empleadosArr.map((e) => [e.legajo, e]))

    // Rango UTC: el día Argentina arranca a las 03:00 UTC.
    const fechaDesde = `${d}T03:00:00+00:00`
    const fechaHastaDt = new Date(`${h}T03:00:00Z`)
    fechaHastaDt.setDate(fechaHastaDt.getDate() + 1)
    const fechaHasta = fechaHastaDt.toISOString()

    // Marcas de entrada del rango (paginadas — un rango YTD supera 1000 filas).
    const marcas = await fetchAllRows<{ legajo: number; fecha_marca: string }>(
      (from, to) =>
        supabase
          .from("asistencia_marcas")
          .select("legajo, fecha_marca")
          .eq("tipo_marca", "E")
          .gte("fecha_marca", fechaDesde)
          .lt("fecha_marca", fechaHasta)
          .order("fecha_marca")
          .range(from, to),
    )

    // Agrupar por fecha Argentina → legajo → primera marca de entrada.
    const porDia = new Map<string, Map<number, string>>()
    for (const m of marcas) {
      if (!empMap.has(m.legajo)) continue // empleado fuera del filtro
      const fa = fechaArg(m.fecha_marca)
      let dia = porDia.get(fa)
      if (!dia) {
        dia = new Map()
        porDia.set(fa, dia)
      }
      if (!dia.has(m.legajo)) dia.set(m.legajo, m.fecha_marca)
    }

    // Serie diaria + resumen acumulado + agregado por empleado.
    const serie: PuntualidadResumenDia[] = []
    let totResumen = 0
    let puntResumen = 0
    const aggEmp = new Map<number, { ficho: number; puntual: number }>()

    for (const fecha of [...porDia.keys()].sort()) {
      const dia = porDia.get(fecha)!
      let tot = 0
      let punt = 0
      for (const [legajo, fechaMarca] of dia) {
        tot++
        const p = esPuntualMarca(fechaMarca)
        if (p) punt++
        const a = aggEmp.get(legajo) ?? { ficho: 0, puntual: 0 }
        a.ficho++
        if (p) a.puntual++
        aggEmp.set(legajo, a)
      }
      serie.push({
        fecha,
        total_ficharon: tot,
        puntuales: punt,
        pct_puntualidad: tot > 0 ? Math.round((punt / tot) * 100) : 0,
      })
      totResumen += tot
      puntResumen += punt
    }

    // Detalle agregado por empleado (cualquier período).
    const detalleEmpleados: PuntualidadEmpleadoAgg[] = []
    for (const [legajo, a] of aggEmp) {
      const e = empMap.get(legajo)
      if (!e) continue
      detalleEmpleados.push({
        legajo,
        nombre: e.nombre,
        sector: e.sector ?? "Distribución",
        sucursal: e.sucursal ?? null,
        dias_ficho: a.ficho,
        dias_puntual: a.puntual,
        pct_puntualidad: a.ficho > 0 ? Math.round((a.puntual / a.ficho) * 100) : 0,
      })
    }
    // Peores primero — surface a los empleados con problema.
    detalleEmpleados.sort(
      (x, y) =>
        x.pct_puntualidad - y.pct_puntualidad || x.nombre.localeCompare(y.nombre),
    )

    // Detalle del día (solo si el rango es un único día).
    const detalleDia: PuntualidadDetalle[] = []
    if (d === h) {
      const dia = porDia.get(d)
      if (dia) {
        for (const [legajo, fechaMarca] of dia) {
          const e = empMap.get(legajo)
          if (!e) continue
          detalleDia.push({
            legajo,
            nombre: e.nombre,
            sector: e.sector ?? "Distribución",
            sucursal: e.sucursal ?? null,
            primera_entrada: fechaMarca,
            puntual: esPuntualMarca(fechaMarca),
          })
        }
        detalleDia.sort((x, y) => {
          if (x.puntual !== y.puntual) return x.puntual ? -1 : 1
          return x.nombre.localeCompare(y.nombre)
        })
      }
    }

    return {
      data: {
        periodo,
        desde: d,
        hasta: h,
        resumen: {
          total_ficharon: totResumen,
          puntuales: puntResumen,
          pct_puntualidad:
            totResumen > 0 ? Math.round((puntResumen / totResumen) * 100) : 0,
        },
        serie_diaria: serie,
        detalle_dia: detalleDia,
        detalle_empleados: detalleEmpleados,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando puntualidad",
    }
  }
}

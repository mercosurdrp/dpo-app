"use server"

// Visibilidad de Resultados (DPO Entrega 2.1) — Pampeana.
// · getVisibilidadEmpleado: SOLO los datos del empleado logueado (R2.1.4:
//   individualizado, sin intervención de líderes). La identidad se resuelve
//   por profiles.id → empleados.profile_id; jamás por parámetro.
// · getVisibilidadEquipo: tabla del equipo completo para
//   admin/supervisor/admin_rrhh/auditor. `viewer` y `empleado` quedan afuera
//   (HHEE es dato sensible, cercano a compensación).

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  hheePorLegajo,
  resumirHhee,
  type HheeDia,
  type MarcaHheeRow,
} from "@/lib/asistencia/horas-extras"
import { getBultosRangoEmpleados } from "@/lib/entrega/bultos-empleado"

type Result<T> = { data: T } | { error: string }

// ── helpers de mes (hora Argentina) ──

function mesActualARG(): string {
  const arg = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return `${arg.getUTCFullYear()}-${String(arg.getUTCMonth() + 1).padStart(2, "0")}`
}

function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`
}

/** Mes actual y los 2 anteriores (límite del selector). */
export async function mesesDisponibles(): Promise<string[]> {
  const actual = mesActualARG()
  const prev = mesAnterior(actual)
  return [mesAnterior(prev), prev, actual]
}

function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` }
}

function validarMes(mes: string | undefined): string | null {
  const actual = mesActualARG()
  if (!mes) return actual
  if (!/^\d{4}-\d{2}$/.test(mes)) return null
  const prev = mesAnterior(actual)
  return [mesAnterior(prev), prev, actual].includes(mes) ? mes : null
}

const PAGE = 1000

async function marcasRango(
  legajo: number | null,
  desde: string,
  hasta: string,
): Promise<MarcaHheeRow[]> {
  const supabase = await createClient()
  const rows: MarcaHheeRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("asistencia_marcas")
      .select("legajo, fecha_marca, tipo_marca")
      .gte("fecha_marca", `${desde}T00:00:00Z`)
      .lte("fecha_marca", `${hasta}T23:59:59Z`)
      .order("fecha_marca", { ascending: true })
      .range(from, from + PAGE - 1)
    if (legajo !== null) q = q.eq("legajo", legajo)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    rows.push(...(data as MarcaHheeRow[]))
    if (data.length < PAGE) break
  }
  return rows
}

// ── Vista EMPLEADO ──

export interface VisibilidadDia {
  fecha: string
  salida: string | null
  hs_50: number
  hs_100: number
  tipo: HheeDia["tipo"]
  bultos: number
}

export interface VisibilidadEmpleadoData {
  mes: string
  meses_disponibles: string[]
  empleado: { nombre: string; legajo: number; sector: string | null }
  hhee: {
    hs_50: number
    hs_100: number
    total: number
    total_mes_anterior: number
  }
  bultos: {
    vinculado: boolean
    total_mes: number
    total_mes_anterior: number
    dias_con_entrega: number
    promedio_dia: number
  }
  /** Días con actividad del mes pedido, descendente. */
  dias: VisibilidadDia[]
}

export async function getVisibilidadEmpleado(
  mesParam?: string,
): Promise<Result<VisibilidadEmpleadoData>> {
  try {
    const profile = await requireAuth()
    if (IS_MISIONES) return { error: "Disponible solo en Pampeana." }

    const mes = validarMes(mesParam)
    if (!mes) return { error: "Mes inválido." }

    const supabase = await createClient()
    const { data: empleado } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector")
      .eq("profile_id", profile.id)
      .maybeSingle()
    if (!empleado) {
      return { error: "Tu usuario no está vinculado a un legajo. Pedile a tu supervisor que lo configure." }
    }

    const mesAnt = mesAnterior(mes)
    const rango = rangoMes(mes)
    const rangoAnt = rangoMes(mesAnt)

    const admin = createAdminClient()
    const [marcas, bultosMap] = await Promise.all([
      marcasRango(empleado.legajo, rangoAnt.desde, rango.hasta),
      getBultosRangoEmpleados(admin, [empleado.id], rangoAnt.desde, rango.hasta),
    ])

    const diasHhee = hheePorLegajo(marcas).get(empleado.legajo) ?? []
    const diasMes = diasHhee.filter((d) => d.fecha.startsWith(mes))
    const diasAnt = diasHhee.filter((d) => d.fecha.startsWith(mesAnt))
    const resumen = resumirHhee(diasMes)
    const resumenAnt = resumirHhee(diasAnt)

    const bultos = bultosMap.get(empleado.id)
    let bultosMes = 0
    let bultosAnt = 0
    let diasConEntrega = 0
    const bultosPorDia = new Map<string, number>()
    for (const [fecha, b] of bultos?.por_dia ?? []) {
      if (fecha.startsWith(mes)) {
        bultosMes += b
        diasConEntrega++
        bultosPorDia.set(fecha, b)
      } else if (fecha.startsWith(mesAnt)) {
        bultosAnt += b
      }
    }

    // Unir HHEE + bultos por fecha (días con cualquier actividad).
    const fechas = new Set<string>([...diasMes.map((d) => d.fecha), ...bultosPorDia.keys()])
    const dias: VisibilidadDia[] = [...fechas]
      .sort((a, b) => b.localeCompare(a))
      .map((fecha) => {
        const h = diasMes.find((d) => d.fecha === fecha)
        return {
          fecha,
          salida: h?.salida ?? null,
          hs_50: h?.hs_50 ?? 0,
          hs_100: h?.hs_100 ?? 0,
          tipo: h?.tipo ?? "normal",
          bultos: Math.round(bultosPorDia.get(fecha) ?? 0),
        }
      })

    return {
      data: {
        mes,
        meses_disponibles: await mesesDisponibles(),
        empleado: { nombre: empleado.nombre, legajo: empleado.legajo, sector: empleado.sector },
        hhee: {
          hs_50: resumen.hs_50,
          hs_100: resumen.hs_100,
          total: resumen.total,
          total_mes_anterior: resumenAnt.total,
        },
        bultos: {
          vinculado: bultos?.vinculado ?? false,
          total_mes: Math.round(bultosMes),
          total_mes_anterior: Math.round(bultosAnt),
          dias_con_entrega: diasConEntrega,
          promedio_dia: diasConEntrega > 0 ? Math.round(bultosMes / diasConEntrega) : 0,
        },
        dias,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tus resultados" }
  }
}

// ── Vista EQUIPO ──

const ROLES_EQUIPO = ["admin", "supervisor", "admin_rrhh", "auditor"]

export interface VisibilidadEquipoRow {
  empleado_id: string
  nombre: string
  legajo: number
  sector: string | null
  dias_trabajados: number
  dias_sin_salida: number
  dias_revisar: number
  hs_50: number
  hs_100: number
  hhee_total: number
  /** null = sin mapeo a camión. */
  bultos_mes: number | null
  dias_con_entrega: number
}

export interface VisibilidadEquipoData {
  mes: string
  meses_disponibles: string[]
  filas: VisibilidadEquipoRow[]
  sectores: string[]
  sin_mapeo: number
}

export async function getVisibilidadEquipo(
  mesParam?: string,
): Promise<Result<VisibilidadEquipoData>> {
  try {
    const profile = await requireAuth()
    if (IS_MISIONES) return { error: "Disponible solo en Pampeana." }
    if (!ROLES_EQUIPO.includes(profile.role)) return { error: "Sin permiso." }

    const mes = validarMes(mesParam)
    if (!mes) return { error: "Mes inválido." }
    const rango = rangoMes(mes)

    const supabase = await createClient()
    const { data: empleados, error: errEmp } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector")
      .eq("activo", true)
      .order("nombre")
    if (errEmp) return { error: errEmp.message }

    const lista = (empleados ?? []) as Array<{
      id: string
      legajo: number
      nombre: string
      sector: string | null
    }>

    const admin = createAdminClient()
    const [marcas, bultosMap] = await Promise.all([
      marcasRango(null, rango.desde, rango.hasta),
      getBultosRangoEmpleados(
        admin,
        lista.map((e) => e.id),
        rango.desde,
        rango.hasta,
      ),
    ])

    const hheeMap = hheePorLegajo(marcas)

    let sinMapeo = 0
    const filas: VisibilidadEquipoRow[] = lista.map((e) => {
      const dias = (hheeMap.get(e.legajo) ?? []).filter((d) => d.fecha.startsWith(mes))
      const resumen = resumirHhee(dias)
      const bultos = bultosMap.get(e.id)
      if (!bultos?.vinculado) sinMapeo++
      let bultosMes = 0
      let diasEntrega = 0
      for (const [fecha, b] of bultos?.por_dia ?? []) {
        if (fecha.startsWith(mes)) {
          bultosMes += b
          diasEntrega++
        }
      }
      return {
        empleado_id: e.id,
        nombre: e.nombre,
        legajo: e.legajo,
        sector: e.sector,
        dias_trabajados: dias.length,
        dias_sin_salida: dias.filter((d) => d.tipo === "sin_salida").length,
        dias_revisar: dias.filter((d) => d.tipo === "revisar").length,
        hs_50: resumen.hs_50,
        hs_100: resumen.hs_100,
        hhee_total: resumen.total,
        bultos_mes: bultos?.vinculado ? Math.round(bultosMes) : null,
        dias_con_entrega: diasEntrega,
      }
    })

    const sectores = [...new Set(lista.map((e) => e.sector).filter((s): s is string => !!s))].sort()

    return {
      data: {
        mes,
        meses_disponibles: await mesesDisponibles(),
        filas,
        sectores,
        sin_mapeo: sinMapeo,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el equipo" }
  }
}

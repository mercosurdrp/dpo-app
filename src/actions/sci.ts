"use server"
/**
 * SCI — Índice de Curva de Ventas (Planeamiento 4.3 · Entrega 3.1 · TOR Ventas-Logística).
 * Lee el volumen diario distribuido (pc_volumen_diario, cargado por el cron de
 * Períodos Críticos) y los feriados, y devuelve el SCI mes a mes del año pedido
 * y del anterior más la serie diaria para dibujar la curva. El cálculo vive en
 * `@/lib/sci` para que sea testeable sin base.
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { calcularSciMes, evaluarDpo, type DiaVolumen, type EvaluacionDpo, type SciMes } from "@/lib/sci"

type Result<T> = { data: T } | { error: string }

export interface SciData {
  anio: number
  hoy: { anio: number; mes: number }
  /** Meses del año pedido y del anterior (24 filas, ordenadas). */
  meses: SciMes[]
  /** Serie diaria de los dos años, para la curva del mes elegido. */
  dias: DiaVolumen[]
  evaluacion: EvaluacionDpo
  /** Último día con dato cargado. */
  ultimaFecha: string | null
}

function hoyArg(): { anio: number; mes: number } {
  // Fecha de Argentina (UTC−3) sin depender de la TZ del server.
  const d = new Date(Date.now() - 3 * 3600 * 1000)
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}

export async function getSciData(params?: { anio?: number }): Promise<Result<SciData>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArg()
    const anio = params?.anio && params.anio >= 2024 && params.anio <= hoy.anio + 1 ? params.anio : hoy.anio
    const desde = `${anio - 1}-01-01`
    const hasta = `${anio}-12-31`

    // Un año por consulta para quedar lejos del tope de filas de PostgREST.
    const [v1, v2, fer] = await Promise.all([
      supabase
        .from("pc_volumen_diario")
        .select("fecha, bultos_distribuidos, clientes_distribuidos, hl_total, clientes_dia")
        .gte("fecha", desde)
        .lte("fecha", `${anio - 1}-12-31`)
        .order("fecha"),
      supabase
        .from("pc_volumen_diario")
        .select("fecha, bultos_distribuidos, clientes_distribuidos, hl_total, clientes_dia")
        .gte("fecha", `${anio}-01-01`)
        .lte("fecha", hasta)
        .order("fecha"),
      supabase.from("pc_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
    ])
    if (v1.error) return { error: v1.error.message }
    if (v2.error) return { error: v2.error.message }
    if (fer.error) return { error: fer.error.message }

    const feriados = new Map<string, string>()
    for (const f of fer.data ?? []) feriados.set(String(f.fecha).slice(0, 10), String(f.nombre))

    const dias: DiaVolumen[] = [...(v1.data ?? []), ...(v2.data ?? [])].map((r) => {
      const fecha = String(r.fecha).slice(0, 10)
      // Pampeana carga bultos_distribuidos (= HL) y clientes_distribuidos; las
      // columnas hl_total / clientes_dia quedan como respaldo del seed de Misiones.
      const hl = Number(r.bultos_distribuidos ?? r.hl_total ?? 0)
      const clientes = Number(r.clientes_distribuidos ?? r.clientes_dia ?? 0)
      return {
        fecha,
        hl: Number.isFinite(hl) ? hl : 0,
        clientes: Number.isFinite(clientes) ? clientes : 0,
        feriado: feriados.get(fecha) ?? null,
      }
    })

    const meses: SciMes[] = []
    for (const a of [anio - 1, anio]) {
      for (let m = 1; m <= 12; m++) meses.push(calcularSciMes(dias, a, m, hoy))
    }

    return {
      data: {
        anio,
        hoy,
        meses,
        dias,
        evaluacion: evaluarDpo(meses, anio),
        ultimaFecha: dias.length ? dias[dias.length - 1].fecha : null,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al calcular el SCI" }
  }
}

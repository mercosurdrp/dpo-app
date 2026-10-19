"use server"
/**
 * SCI — Índice de Curva de Ventas (Planeamiento 4.3 · Entrega 3.1 · TOR Ventas-Logística).
 * Lee los HL distribuidos por día (ventas_diarias: planillas de carga de Chess
 * + repartos de GESCOM, el mismo número de los tableros de distribución), los
 * clientes por día y la facturación histórica (pc_volumen_diario, sólo para las
 * fechas anteriores a ventas_diarias) y los feriados, y devuelve el SCI mes a
 * mes del año pedido y del anterior más la serie diaria para dibujar la curva.
 * El cálculo vive en `@/lib/sci` para que sea testeable sin base.
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
  /** Primer día con planillas de carga (ventas_diarias). Antes de esa fecha el HL es facturación. */
  distribucionDesde: string | null
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/** HL distribuidos por fecha desde ventas_diarias (Chess + GESCOM), paginado por el tope de PostgREST. */
async function hlDistribuidosPorFecha(
  supabase: SupabaseServer,
  desde: string,
  hasta: string,
): Promise<{ porFecha: Map<string, number>; error: string | null }> {
  const PAGE = 1000
  const porFecha = new Map<string, number>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("ventas_diarias")
      .select("fecha, total_hl")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { porFecha, error: error.message }
    for (const r of data ?? []) {
      const f = String(r.fecha).slice(0, 10)
      const hl = Number(r.total_hl)
      porFecha.set(f, (porFecha.get(f) ?? 0) + (Number.isFinite(hl) ? hl : 0))
    }
    if (!data || data.length < PAGE) break
  }
  return { porFecha, error: null }
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
    const [v1, v2, fer, vd] = await Promise.all([
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
      hlDistribuidosPorFecha(supabase, desde, hasta),
    ])
    if (v1.error) return { error: v1.error.message }
    if (v2.error) return { error: v2.error.message }
    if (fer.error) return { error: fer.error.message }
    if (vd.error) return { error: vd.error }

    const distribuidos = vd.porFecha
    const distribucionDesde = distribuidos.size ? [...distribuidos.keys()].sort()[0] : null

    const feriados = new Map<string, string>()
    for (const f of fer.data ?? []) feriados.set(String(f.fecha).slice(0, 10), String(f.nombre))

    // Clientes por día y facturación histórica (pc_volumen_diario). Pampeana
    // carga bultos_distribuidos (= HL facturados Chess + GESCOM sin patentes) y
    // clientes_distribuidos; hl_total / clientes_dia son el respaldo de Misiones.
    const porFecha = new Map<string, DiaVolumen>()
    for (const r of [...(v1.data ?? []), ...(v2.data ?? [])]) {
      const fecha = String(r.fecha).slice(0, 10)
      const hlFact = Number(r.bultos_distribuidos ?? r.hl_total ?? 0)
      const clientes = Number(r.clientes_distribuidos ?? r.clientes_dia ?? 0)
      // Desde que existen planillas de carga, el HL es SÓLO lo distribuido: un
      // día sin planillas es un día sin reparto aunque se haya facturado.
      const usaFacturacion = distribucionDesde === null || fecha < distribucionDesde
      const hl = usaFacturacion ? hlFact : (distribuidos.get(fecha) ?? 0)
      porFecha.set(fecha, {
        fecha,
        hl: Number.isFinite(hl) ? hl : 0,
        clientes: Number.isFinite(clientes) ? clientes : 0,
        feriado: feriados.get(fecha) ?? null,
        fuente: usaFacturacion ? "facturacion" : "distribucion",
      })
    }
    // Días con planillas de carga pero sin fila en pc_volumen_diario (cron atrasado).
    for (const [fecha, hl] of distribuidos) {
      if (!porFecha.has(fecha)) {
        porFecha.set(fecha, { fecha, hl, clientes: 0, feriado: feriados.get(fecha) ?? null, fuente: "distribucion" })
      }
    }
    const dias = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))

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
        distribucionDesde,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al calcular el SCI" }
  }
}

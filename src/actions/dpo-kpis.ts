"use server"

import { createClient } from "@/lib/supabase/server"
import { calcularKpisConClient } from "@/lib/dpo-kpis-calc"

// ---------- Types ----------

export interface DpoKpiValue {
  numero: number
  valor: number | null
  es_auto: boolean
}

export interface DpoKpisData {
  mes: number
  anio: number
  valores: DpoKpiValue[]
}

// KPI numbers that are auto-calculated from ventas/rechazos data
const AUTO_KPI_NUMBERS = [9, 16, 17, 18, 21, 22, 23, 24, 25, 26, 35, 36]

// ---------- getDpoKpis ----------

export async function getDpoKpis(
  mes: number,
  anio: number
): Promise<{ data: DpoKpisData } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: rows, error: dbErr } = await supabase
      .from("dpo_kpis")
      .select("numero, valor, es_auto")
      .eq("mes", mes)
      .eq("anio", anio)
      .order("numero")

    if (dbErr) return { error: dbErr.message }

    // Build a map of existing values
    const valueMap = new Map<number, { valor: number | null; es_auto: boolean }>()
    for (const r of rows ?? []) {
      valueMap.set(r.numero, {
        valor: r.valor != null ? Number(r.valor) : null,
        es_auto: r.es_auto ?? false,
      })
    }

    // Build array of 56 items (1..56)
    const valores: DpoKpiValue[] = []
    for (let i = 1; i <= 56; i++) {
      const existing = valueMap.get(i)
      valores.push({
        numero: i,
        valor: existing?.valor ?? null,
        es_auto: existing?.es_auto ?? AUTO_KPI_NUMBERS.includes(i),
      })
    }

    return {
      data: { mes, anio, valores },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando KPIs" }
  }
}

// ---------- saveDpoKpisManual ----------

export async function saveDpoKpisManual(
  mes: number,
  anio: number,
  valores: { numero: number; valor: number }[]
): Promise<{ success: true } | { error: string }> {
  try {
    const supabase = await createClient()

    // Filter out auto-calculated KPIs — only save manual ones
    const manualValues = valores.filter(
      (v) => !AUTO_KPI_NUMBERS.includes(v.numero)
    )

    if (manualValues.length === 0) {
      return { success: true }
    }

    const rows = manualValues.map((v) => ({
      mes,
      anio,
      numero: v.numero,
      valor: v.valor,
      es_auto: false,
      updated_at: new Date().toISOString(),
    }))

    const { error: dbErr } = await supabase
      .from("dpo_kpis")
      .upsert(rows, { onConflict: "mes,anio,numero" })

    if (dbErr) return { error: dbErr.message }

    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando KPIs manuales" }
  }
}

// ---------- getDpoKpiDrilldown ----------

export interface DrilldownRow {
  label: string
  detalle: string
  valor: number
}

export interface DrilldownData {
  titulo: string
  columnas: { label: string; detalle: string; valor: string }
  rows: DrilldownRow[]
  total: number
}

// Mapping of rechazo reasons per KPI
const RECHAZO_FILTERS: Record<number, string[]> = {
  9: ["PRODUCTO NO APTO"],
  22: ["SIN STOCK"],
  23: ["ERROR DE PREVENTA", "ERROR DE CARGA"],
  24: ["ERROR DE DISTRIBUCIO", "ERROR DE DISTRIBUCIÓN"],
  25: [], // all
}

export async function getDpoKpiDrilldown(
  mes: number,
  anio: number,
  numero: number
): Promise<{ data: DrilldownData } | { error: string }> {
  try {
    const supabase = await createClient()
    const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
    const ultimoDia = new Date(anio, mes, 0).getDate()
    const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

    // KPIs based on rechazos (9, 22, 23, 24, 25)
    if ([9, 22, 23, 24, 25].includes(numero)) {
      const { data: rechazos, error } = await supabase
        .from("rechazos")
        .select("fecha, ds_fletero_carga, ds_rechazo, ds_articulo, bultos_rechazados, nombre_cliente")
        .gte("fecha", primerDia)
        .lte("fecha", ultimaFecha)
        .order("fecha")

      if (error) return { error: error.message }

      const filters = RECHAZO_FILTERS[numero]
      const filtered = filters.length > 0
        ? (rechazos ?? []).filter((r) => filters.includes(r.ds_rechazo))
        : (rechazos ?? [])

      const rows: DrilldownRow[] = filtered.map((r) => ({
        label: `${r.fecha} — ${r.ds_fletero_carga}`,
        detalle: `${r.ds_articulo} → ${r.nombre_cliente ?? "S/N"} (${r.ds_rechazo})`,
        valor: Math.abs(Number(r.bultos_rechazados) || 0),
      }))

      const total = rows.reduce((s, r) => s + r.valor, 0)

      return {
        data: {
          titulo: `Detalle KPI #${numero}`,
          columnas: { label: "Fecha / Fletero", detalle: "Articulo / Cliente", valor: "Bultos" },
          rows,
          total: Math.round(total * 100) / 100,
        },
      }
    }

    // KPIs based on ventas_diarias
    if ([16, 17, 18, 21, 26, 35, 36].includes(numero)) {
      const { data: ventas, error } = await supabase
        .from("ventas_diarias")
        .select("fecha, ds_fletero_carga, total_bultos, total_unidades, total_hl, viajes")
        .gte("fecha", primerDia)
        .lte("fecha", ultimaFecha)
        .order("fecha")

      if (error) return { error: error.message }

      const ventasArr = ventas ?? []

      if (numero === 16) {
        // Viajes por fletero
        const porFletero = new Map<string, number>()
        for (const v of ventasArr) {
          porFletero.set(v.ds_fletero_carga, (porFletero.get(v.ds_fletero_carga) ?? 0) + (Number(v.viajes) || 0))
        }
        const rows: DrilldownRow[] = [...porFletero.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([f, viajes]) => ({ label: f, detalle: "Patente", valor: viajes }))
        return { data: { titulo: "Viajes por Fletero", columnas: { label: "Fletero", detalle: "", valor: "Viajes" }, rows, total: rows.reduce((s, r) => s + r.valor, 0) } }
      }

      if (numero === 17) {
        // Camiones distintos
        const fleteros = new Set(ventasArr.map((v) => v.ds_fletero_carga))
        const rows: DrilldownRow[] = [...fleteros].sort().map((f) => ({ label: f, detalle: "Patente", valor: 1 }))
        return { data: { titulo: "Camiones en Flota", columnas: { label: "Patente", detalle: "", valor: "" }, rows, total: fleteros.size } }
      }

      if (numero === 18) {
        // Cajas por fletero
        const porFletero = new Map<string, number>()
        for (const v of ventasArr) {
          porFletero.set(v.ds_fletero_carga, (porFletero.get(v.ds_fletero_carga) ?? 0) + Math.abs(Number(v.total_unidades) || 0))
        }
        const rows: DrilldownRow[] = [...porFletero.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([f, val]) => ({ label: f, detalle: "Patente", valor: Math.round(val * 100) / 100 }))
        return { data: { titulo: "Cajas Equivalentes por Fletero", columnas: { label: "Fletero", detalle: "", valor: "Cajas" }, rows, total: rows.reduce((s, r) => s + r.valor, 0) } }
      }

      if (numero === 21) {
        // Bultos por fletero
        const porFletero = new Map<string, number>()
        for (const v of ventasArr) {
          porFletero.set(v.ds_fletero_carga, (porFletero.get(v.ds_fletero_carga) ?? 0) + Math.abs(Number(v.total_bultos) || 0))
        }
        const rows: DrilldownRow[] = [...porFletero.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([f, val]) => ({ label: f, detalle: "Patente", valor: Math.round(val * 100) / 100 }))
        return { data: { titulo: "Volumen Ordenado por Fletero", columnas: { label: "Fletero", detalle: "", valor: "Bultos" }, rows, total: rows.reduce((s, r) => s + r.valor, 0) } }
      }

      if (numero === 26) {
        // HL por fletero
        const porFletero = new Map<string, number>()
        for (const v of ventasArr) {
          porFletero.set(v.ds_fletero_carga, (porFletero.get(v.ds_fletero_carga) ?? 0) + Math.abs(Number(v.total_hl) || 0))
        }
        const rows: DrilldownRow[] = [...porFletero.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([f, val]) => ({ label: f, detalle: "Patente", valor: Math.round(val * 10000) / 10000 }))
        return { data: { titulo: "Volumen Entregado por Fletero (HL)", columnas: { label: "Fletero", detalle: "", valor: "HL" }, rows, total: rows.reduce((s, r) => s + r.valor, 0) } }
      }

      if (numero === 35) {
        // FTE diario
        const porDia = new Map<string, Set<string>>()
        for (const v of ventasArr) {
          const fecha = String(v.fecha)
          if (!porDia.has(fecha)) porDia.set(fecha, new Set())
          porDia.get(fecha)!.add(v.ds_fletero_carga)
        }
        const rows: DrilldownRow[] = [...porDia.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([fecha, fleteros]) => ({ label: fecha, detalle: [...fleteros].join(", "), valor: fleteros.size }))
        const avg = rows.length > 0 ? Math.round((rows.reduce((s, r) => s + r.valor, 0) / rows.length) * 100) / 100 : 0
        return { data: { titulo: "FTE Diario de Entrega", columnas: { label: "Fecha", detalle: "Fleteros", valor: "Cant." }, rows, total: avg } }
      }

      if (numero === 36) {
        // Segundas vueltas: fleteros con >1 viaje en un día
        const rows: DrilldownRow[] = ventasArr
          .filter((v) => (Number(v.viajes) || 0) > 1)
          .map((v) => ({ label: String(v.fecha), detalle: v.ds_fletero_carga, valor: Number(v.viajes) || 0 }))
        return { data: { titulo: "Segundas Vueltas", columnas: { label: "Fecha", detalle: "Fletero", valor: "Viajes" }, rows, total: rows.length } }
      }
    }

    return { error: "Este KPI no tiene drill-down disponible" }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando detalle" }
  }
}

// ---------- calcularKpisDesdeVentas ----------

export async function calcularKpisDesdeVentas(
  mes: number,
  anio: number
): Promise<{ data: { calculados: number } } | { error: string }> {
  try {
    const supabase = await createClient()
    return await calcularKpisConClient(supabase, mes, anio)
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error calculando KPIs" }
  }
}

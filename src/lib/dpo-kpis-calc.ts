import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Calculate auto KPIs from rechazos + ventas_diarias tables.
 * Accepts any Supabase client (admin or cookie-based).
 */
export async function calcularKpisConClient(
  supabase: SupabaseClient,
  mes: number,
  anio: number
): Promise<{ data: { calculados: number } } | { error: string }> {
  const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`

  // Fetch rechazos for the month
  const { data: rechazos, error: rechErr } = await supabase
    .from("rechazos")
    .select("bultos_rechazados, ds_rechazo, ds_fletero_carga, planilla_carga, fecha")
    .gte("fecha", primerDia)
    .lte("fecha", ultimaFecha)

  if (rechErr) return { error: rechErr.message }

  // Fetch ventas_diarias for the month
  const { data: ventasDiarias, error: ventasErr } = await supabase
    .from("ventas_diarias")
    .select("fecha, ds_fletero_carga, total_bultos, total_unidades, total_hl, viajes")
    .gte("fecha", primerDia)
    .lte("fecha", ultimaFecha)

  if (ventasErr) return { error: ventasErr.message }

  const rechRows = rechazos ?? []
  const ventasRows = ventasDiarias ?? []

  // ---- KPIs from rechazos ----

  // KPI 9: PRODUCTO NO APTO
  const kpi9 = rechRows
    .filter((r) => r.ds_rechazo === "PRODUCTO NO APTO")
    .reduce((sum, r) => sum + Math.abs(Number(r.bultos_rechazados) || 0), 0)

  // KPI 22: SIN STOCK
  const kpi22 = rechRows
    .filter((r) => r.ds_rechazo === "SIN STOCK")
    .reduce((sum, r) => sum + Math.abs(Number(r.bultos_rechazados) || 0), 0)

  // KPI 23: ERROR DE PREVENTA + ERROR DE CARGA
  const kpi23 = rechRows
    .filter((r) =>
      r.ds_rechazo === "ERROR DE PREVENTA" || r.ds_rechazo === "ERROR DE CARGA"
    )
    .reduce((sum, r) => sum + Math.abs(Number(r.bultos_rechazados) || 0), 0)

  // KPI 24: ERROR DE DISTRIBUCION
  const kpi24 = rechRows
    .filter((r) =>
      r.ds_rechazo === "ERROR DE DISTRIBUCIO" || r.ds_rechazo === "ERROR DE DISTRIBUCIÓN"
    )
    .reduce((sum, r) => sum + Math.abs(Number(r.bultos_rechazados) || 0), 0)

  // KPI 25: ALL rechazos
  const kpi25 = rechRows
    .reduce((sum, r) => sum + Math.abs(Number(r.bultos_rechazados) || 0), 0)

  // ---- KPIs from ventas_diarias ----

  // KPI 16: Sum viajes
  const kpi16 = ventasRows
    .reduce((sum, r) => sum + (Number(r.viajes) || 0), 0)

  // KPI 17: Count distinct fleteros
  const distinctFleteros = new Set(ventasRows.map((r) => r.ds_fletero_carga))
  const kpi17 = distinctFleteros.size

  // KPI 18: Sum total_unidades
  const kpi18 = ventasRows
    .reduce((sum, r) => sum + Math.abs(Number(r.total_unidades) || 0), 0)

  // KPI 21: Sum total_bultos
  const kpi21 = ventasRows
    .reduce((sum, r) => sum + Math.abs(Number(r.total_bultos) || 0), 0)

  // KPI 26: Sum total_hl
  const kpi26 = ventasRows
    .reduce((sum, r) => sum + Math.abs(Number(r.total_hl) || 0), 0)

  // KPI 35: Avg daily count of distinct fleteros
  const fleterosPorDia = new Map<string, Set<string>>()
  for (const r of ventasRows) {
    const fecha = String(r.fecha)
    if (!fleterosPorDia.has(fecha)) fleterosPorDia.set(fecha, new Set())
    fleterosPorDia.get(fecha)!.add(r.ds_fletero_carga)
  }
  const diasConDatos = fleterosPorDia.size
  const kpi35 = diasConDatos > 0
    ? Array.from(fleterosPorDia.values()).reduce((sum, s) => sum + s.size, 0) / diasConDatos
    : 0

  // KPI 36: Count of (fletero, fecha) pairs where fletero has >1 distinct planillaCarga
  const kpi36 = ventasRows.filter((r) => (Number(r.viajes) || 0) > 1).length

  // ---- Upsert all auto KPIs ----
  const kpiValues: { numero: number; valor: number }[] = [
    { numero: 9, valor: Math.round(kpi9 * 100) / 100 },
    { numero: 16, valor: Math.round(kpi16 * 100) / 100 },
    { numero: 17, valor: kpi17 },
    { numero: 18, valor: Math.round(kpi18 * 100) / 100 },
    { numero: 21, valor: Math.round(kpi21 * 100) / 100 },
    { numero: 22, valor: Math.round(kpi22 * 100) / 100 },
    { numero: 23, valor: Math.round(kpi23 * 100) / 100 },
    { numero: 24, valor: Math.round(kpi24 * 100) / 100 },
    { numero: 25, valor: Math.round(kpi25 * 100) / 100 },
    { numero: 26, valor: Math.round(kpi26 * 10000) / 10000 },
    { numero: 35, valor: Math.round(kpi35 * 100) / 100 },
    { numero: 36, valor: kpi36 },
  ]

  const rows = kpiValues.map((v) => ({
    mes,
    anio,
    numero: v.numero,
    valor: v.valor,
    es_auto: true,
    updated_at: new Date().toISOString(),
  }))

  const { error: upsertErr } = await supabase
    .from("dpo_kpis")
    .upsert(rows, { onConflict: "mes,anio,numero" })

  if (upsertErr) return { error: upsertErr.message }

  return { data: { calculados: kpiValues.length } }
}

// KPIs de inventario del pañol de flota (DPO 2.3 / R2.3.3) para la foto
// mensual que guarda el cron `/api/vehiculos/flota-kpi-cron`.
//
// La solapa Indicadores los calcula en vivo para los últimos 3 meses
// (`getFlotaKpiSeriesExtra`); esto deja la serie guardada hacia atrás para
// que la tendencia no se pierda cuando el mes sale de la ventana. Misma
// definición que allá:
//   · inventario_exactitud     ítems sin diferencia ÷ ítems contados, ÚLTIMO conteo del mes
//   · repuestos_stock_minimo   ítems contados en o sobre su mínimo ÷ ítems contados con mínimo > 0
//   · repuestos_trazabilidad   egresos del pañol que nacieron de una OT o de un plan del
//                              checklist ÷ egresos del mes (sin ajustes por conteo)
//   · repuestos_demora_pieza   días promedio de espera de los pedidos del mes
//   · valor_stock_panol        stock × precio unitario, hoy (null si no hay precios)

import type { SupabaseClient } from "@supabase/supabase-js"
import { esAjusteConteo } from "@/lib/flota/inventario-politica"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function finDeMesISO(year: number, mes: number): string {
  const d = new Date(Date.UTC(year, mes, 1))
  return d.toISOString().slice(0, 10)
}

export async function kpisInventarioMes(
  client: SupabaseClient,
  year: number,
  mes: number
): Promise<Record<string, number | null>> {
  const desde = `${year}-${pad2(mes)}-01`
  const hasta = finDeMesISO(year, mes) // exclusivo
  const hoy = new Date().toISOString().slice(0, 10)

  const [conteoRes, movRes, vincOtRes, vincPlanRes, pedRes, repRes] = await Promise.all([
    client
      .from("mantenimiento_conteos")
      .select("id, fecha, items:mantenimiento_conteo_items(stock_sistema, stock_contado, repuesto:mantenimiento_repuestos(stock_min))")
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(1),
    client
      .from("mantenimiento_repuestos_movimientos")
      .select("id, motivo")
      .eq("tipo", "egreso")
      .gte("fecha", desde)
      .lt("fecha", hasta),
    client.from("mantenimiento_realizado_repuestos").select("movimiento_id").not("movimiento_id", "is", null),
    client.from("checklist_planes_accion").select("movimiento_id").not("movimiento_id", "is", null),
    client
      .from("mantenimiento_pedidos")
      .select("fecha, fecha_retiro")
      .neq("estado", "anulado")
      .gte("fecha", desde)
      .lt("fecha", hasta),
    client.from("mantenimiento_repuestos").select("stock_actual, precio_unitario, en_panol"),
  ])

  const out: Record<string, number | null> = {
    inventario_exactitud: null,
    repuestos_stock_minimo: null,
    repuestos_trazabilidad: null,
    repuestos_demora_pieza: null,
    valor_stock_panol: null,
  }

  const conteo = ((conteoRes.data || []) as unknown as Array<{
    items: Array<{ stock_sistema: number; stock_contado: number; repuesto: { stock_min: number | null } | null }>
  }>)[0]
  if (conteo && conteo.items.length > 0) {
    const sinDif = conteo.items.filter((i) => Number(i.stock_sistema) === Number(i.stock_contado)).length
    out.inventario_exactitud = (sinDif / conteo.items.length) * 100
    const conMin = conteo.items.filter((i) => Number(i.repuesto?.stock_min ?? 0) > 0)
    if (conMin.length > 0) {
      const cumplen = conMin.filter((i) => Number(i.stock_contado) >= Number(i.repuesto!.stock_min)).length
      out.repuestos_stock_minimo = (cumplen / conMin.length) * 100
    }
  }

  if (!movRes.error) {
    const vinculados = new Set<string>()
    for (const r of (vincOtRes.data || []) as Array<{ movimiento_id: string | null }>)
      if (r.movimiento_id) vinculados.add(r.movimiento_id)
    for (const r of (vincPlanRes.data || []) as Array<{ movimiento_id: string | null }>)
      if (r.movimiento_id) vinculados.add(r.movimiento_id)
    const egresos = ((movRes.data || []) as Array<{ id: string; motivo: string | null }>).filter(
      (m) => !esAjusteConteo(m.motivo)
    )
    if (egresos.length > 0) {
      out.repuestos_trazabilidad = (egresos.filter((m) => vinculados.has(m.id)).length / egresos.length) * 100
    }
  }

  if (!pedRes.error) {
    const peds = (pedRes.data || []) as Array<{ fecha: string; fecha_retiro: string | null }>
    if (peds.length > 0) {
      const dias = peds.map((p) =>
        Math.max(0, Math.round((Date.parse(p.fecha_retiro ?? hoy) - Date.parse(p.fecha)) / 86_400_000))
      )
      out.repuestos_demora_pieza = dias.reduce((a, b) => a + b, 0) / dias.length
    }
  }

  if (!repRes.error) {
    let valor = 0
    let n = 0
    for (const r of (repRes.data || []) as Array<{
      stock_actual: number
      precio_unitario: number | null
      en_panol: boolean | null
    }>) {
      if (r.en_panol === false || r.precio_unitario == null) continue
      valor += Number(r.stock_actual) * Number(r.precio_unitario)
      n++
    }
    out.valor_stock_panol = n > 0 ? valor : null
  }

  return out
}

"use server"

/**
 * Detalle por día (drill-down) de los indicadores AUTO de Foxtrot en la Matinal
 * de Distribución de Pampeana. Al clickear una celda del tablero se abre un
 * modal con el valor del KPI ese día y el desglose por CAMIÓN (patente).
 *
 * La patente se resuelve cruzando el chofer de Foxtrot con el egreso TML del día
 * (ver lib/foxtrot/patente-pampeana). El valor del día replica exactamente la
 * serie del tablero (buildPampeanaFoxtrotSerie) para que coincidan.
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { foxtrotDcIds } from "@/lib/foxtrot"
import {
  buildPampeanaFoxtrotSerie,
  type PampeanaFoxtrotSerie,
} from "@/lib/foxtrot/auto-indicadores-pampeana"
import {
  patentesPorChoferFecha,
  normChofer,
} from "@/lib/foxtrot/patente-pampeana"
import type {
  FoxtrotKpiId,
  FoxtrotKpiUnidadDetalle,
  FoxtrotKpiDia,
} from "@/lib/foxtrot/matinal-kpi-types"

type Result<T> = { data: T } | { error: string }

const META: Record<FoxtrotKpiId, { titulo: string; unidad: string; serieKey: keyof PampeanaFoxtrotSerie }> = {
  auto_fx_click_score: { titulo: "Driver Click Score", unidad: "%", serieKey: "click_score" },
  auto_fx_adherencia: { titulo: "Adherencia a la secuencia", unidad: "%", serieKey: "adherencia_secuencia" },
  auto_fx_resecuenciado: { titulo: "Rutas con resecuenciado", unidad: "%", serieKey: "pct_resecuenciado" },
  auto_fx_pct_finalizadas: { titulo: "Rutas finalizadas", unidad: "%", serieKey: "pct_finalizadas" },
  auto_fx_entregas_ok: { titulo: "Entregas exitosas", unidad: "%", serieKey: "pct_entregas_exitosas" },
  auto_fx_tiempo_ruta: { titulo: "Tiempo en ruta", unidad: "min", serieKey: "tiempo_ruta" },
  auto_fx_tiempo_pdv: { titulo: "Tiempo por PDV", unidad: "min", serieKey: "tiempo_pdv" },
  auto_fx_km: { titulo: "Km recorridos", unidad: "km", serieKey: "km_recorridos" },
  auto_fx_paradas_no_auth: { titulo: "Paradas no autorizadas", unidad: "u.", serieKey: "paradas_no_autorizadas" },
}

type RouteRow = {
  driver_name: string | null
  is_finalized: boolean | null
  tiempo_ruta_minutos: number | null
  total_deliveries: number | null
  deliveries_successful: number | null
  driver_click_score: number | null
  adherencia_secuencia: number | null
  raw_data: {
    name?: string | null
    fx_seq_enabled?: boolean | null
    fx_driven_m?: number | null
    fx_unauth_stops_count?: number | null
    tml_authorized_stops_seconds?: number | null
    tml_visited_customers?: number | null
  } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Valor por ruta + texto, según el KPI pedido. */
function valorRuta(
  kpiId: FoxtrotKpiId,
  r: RouteRow,
): { valor: number | null; texto: string | null } {
  const rd = r.raw_data ?? {}
  const fin = r.is_finalized === true
  switch (kpiId) {
    case "auto_fx_click_score":
      return { valor: r.driver_click_score ?? null, texto: null }
    case "auto_fx_adherencia":
      return { valor: r.adherencia_secuencia ?? null, texto: null }
    case "auto_fx_resecuenciado":
      if (typeof rd.fx_seq_enabled !== "boolean") return { valor: null, texto: "—" }
      return { valor: rd.fx_seq_enabled ? 100 : 0, texto: rd.fx_seq_enabled ? "Sí" : "No" }
    case "auto_fx_pct_finalizadas":
      return { valor: fin ? 100 : 0, texto: fin ? "Finalizada" : "Activa" }
    case "auto_fx_entregas_ok": {
      if (!fin || !r.total_deliveries || r.total_deliveries <= 0) return { valor: null, texto: null }
      return { valor: round1((100 * (r.deliveries_successful ?? 0)) / r.total_deliveries), texto: null }
    }
    case "auto_fx_tiempo_ruta":
      return fin && r.tiempo_ruta_minutos ? { valor: Math.round(r.tiempo_ruta_minutos), texto: null } : { valor: null, texto: null }
    case "auto_fx_tiempo_pdv": {
      const a = rd.tml_authorized_stops_seconds
      const v = rd.tml_visited_customers
      if (a != null && v != null && v > 0) return { valor: round1(a / v / 60), texto: null }
      return { valor: null, texto: null }
    }
    case "auto_fx_km":
      return rd.fx_driven_m != null ? { valor: round1(rd.fx_driven_m / 1000), texto: null } : { valor: null, texto: null }
    case "auto_fx_paradas_no_auth":
      return rd.fx_unauth_stops_count != null ? { valor: Math.round(rd.fx_unauth_stops_count), texto: null } : { valor: null, texto: null }
  }
}

export async function getFoxtrotKpiDia(
  fecha: string,
  kpiId: FoxtrotKpiId,
): Promise<Result<FoxtrotKpiDia>> {
  try {
    await requireAuth()
    const meta = META[kpiId]
    if (!meta) return { error: "KPI desconocido" }
    const supabase = await createClient()
    const dcs = foxtrotDcIds()

    const { data: rowsRaw, error } = await supabase
      .from("foxtrot_routes")
      .select(
        "driver_name, is_finalized, tiempo_ruta_minutos, total_deliveries, deliveries_successful, driver_click_score, adherencia_secuencia, raw_data",
      )
      .in("dc_id", dcs)
      .eq("fecha", fecha)
    if (error) return { error: error.message }
    const rows = (rowsRaw ?? []) as RouteRow[]

    // Patente por chofer (egreso TML del día).
    const patenteMap = await patentesPorChoferFecha(supabase, fecha, fecha)

    const detalle: FoxtrotKpiUnidadDetalle[] = rows.map((r) => {
      const chofer = (r.driver_name ?? "").trim() || "—"
      const { valor, texto } = valorRuta(kpiId, r)
      return {
        patente: patenteMap.get(`${fecha}|${normChofer(r.driver_name)}`) ?? null,
        chofer,
        ruta: (r.raw_data?.name ?? "").toString().trim() || "—",
        valor,
        texto,
        finalizada: r.is_finalized === true,
      }
    })

    // Orden: las que tienen valor primero (peor → mejor según el KPI no importa;
    // ordenamos por valor descendente para que las altas queden arriba), las
    // sin dato al final.
    detalle.sort((a, b) => {
      if (a.valor == null && b.valor == null) return a.chofer.localeCompare(b.chofer)
      if (a.valor == null) return 1
      if (b.valor == null) return -1
      return b.valor - a.valor
    })

    // Valor del día: misma serie que el tablero, para 1 sola fecha.
    const serie = await buildPampeanaFoxtrotSerie(supabase, [fecha])
    const valorDia = serie[meta.serieKey][fecha] ?? null

    return {
      data: {
        kpi_id: kpiId,
        titulo: meta.titulo,
        unidad: meta.unidad,
        valor_dia: valorDia,
        detalle,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el detalle del día" }
  }
}

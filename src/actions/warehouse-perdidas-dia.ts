"use server"
/**
 * Detalle diario del tablero warehouse para el popover de /reuniones
 * (celda WQI de la reunión de logística).
 *
 * IMPORTANTE — consistencia con la fila WQI:
 * Las roturas/faltantes (HL) y el $ de pérdidas se leen de la MISMA fuente que
 * usa el valor de WQI del tablero: la serie diaria de deposito-esteban
 * (`/api/indicadores/serie-diaria`, campos roturas_dia/faltantes_dia/scl_dia y
 * el acumulado roturas para el MTD). Antes esto salía de un blob precocido
 * (module=warehouse-dia-detalle) que podía estar desincronizado con la serie
 * diaria — p. ej. el 22/06 el blob decía 0 roturas mientras la serie diaria
 * tenía 0,1883 HL, así que el popover mostraba "no hubo roturas" junto a un WQI
 * de 1097,7 PPM. Al unificar la fuente, el popover siempre coincide con la
 * celda de WQI sobre la que se hizo click.
 *
 * Bultos y HL VENDIDOS se leen de `ventas_diarias` (el tablero, misma fuente que
 * las filas "Bultos vendidos"/"HL vendidos" y que el denominador del WQI). El
 * WQI día/MTD se recalcula acá con ese HL del tablero, idéntico a como lo arma
 * la fila WQI de la reunión.
 */
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

export interface WarehousePerdidasDia {
  fecha: string
  bultos: number | null
  /** HL vendidos del día (ventas_diarias) = denominador del WQI. */
  hl_vendido: number | null
  devoluciones: number | null
  roturas_hl: number | null
  faltantes_hl: number | null
  perdidas_val: number | null
  wqi_dia: number | null
  wqi_mtd: number | null
}

interface SerieDiariaResp {
  /** Roturas HL por día (numerador del WQI del día). */
  roturas_dia?: Record<string, number | null>
  /** Roturas HL acumuladas MTD por día (numerador del WQI acumulado). */
  roturas?: Record<string, number | null>
  faltantes_dia?: Record<string, number | null>
  /** $ de pérdidas del día (SCL diario). */
  scl_dia?: Record<string, number | null>
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

export async function getWarehousePerdidasDia(
  fecha: string | null,
): Promise<{ data: WarehousePerdidasDia | null } | { error: string }> {
  try {
    await requireAuth()
    if (!fecha) return { data: null }

    const [y, m] = fecha.split("-")
    const year = Number(y)
    const month = Number(m)

    // 1) Roturas / faltantes / $ del día desde la serie diaria (misma fuente
    //    que el valor de WQI del tablero).
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      { cache: "no-store" },
    )
    if (!res.ok) return { error: `No se pudo cargar el detalle (HTTP ${res.status})` }
    const serie = (await res.json()) as SerieDiariaResp
    const roturasDiaSerie = serie.roturas_dia ?? {}
    const roturasMtdSerie = serie.roturas ?? {}
    const faltantesDiaSerie = serie.faltantes_dia ?? {}
    const sclDiaSerie = serie.scl_dia ?? {}

    const roturasDia = num(roturasDiaSerie[fecha])
    const faltantesDia = num(faltantesDiaSerie[fecha])
    const perdidasVal = num(sclDiaSerie[fecha])

    // 2) Bultos + HL vendidos del TABLERO (ventas_diarias), por día del mes.
    const supabase = await createClient()
    const desde = `${y}-${m}-01`
    const hasta = `${y}-${m}-31`
    const { data: vd } = await supabase
      .from("ventas_diarias")
      .select("fecha, total_bultos, total_hl")
      .gte("fecha", desde)
      .lte("fecha", hasta)
    const bultosDia: Record<string, number> = {}
    const hlDia: Record<string, number> = {}
    for (const v of (vd ?? []) as Array<{
      fecha: string
      total_bultos: number | null
      total_hl: number | null
    }>) {
      const b = Number(v.total_bultos ?? 0)
      const h = Number(v.total_hl ?? 0)
      if (Number.isFinite(b)) bultosDia[v.fecha] = (bultosDia[v.fecha] ?? 0) + b
      if (Number.isFinite(h)) hlDia[v.fecha] = (hlDia[v.fecha] ?? 0) + h
    }

    const bultos = fecha in bultosDia ? bultosDia[fecha] : null
    const hlVendidoDia = hlDia[fecha] ?? 0

    // WQI del día = HL roturas día ÷ HL vendidos día (tablero) × 1M. Idéntico a
    // la fila WQI: sólo hay valor cuando hay HL vendido cargado ese día.
    const wqiDia =
      roturasDia != null && hlVendidoDia > 0
        ? Math.round((roturasDia / hlVendidoDia) * 1_000_000 * 10) / 10
        : null

    // WQI MTD = Σ HL roturas (acumulado de la serie) ÷ Σ HL vendidos (tablero)
    // hasta la fecha inclusive. Mismo criterio que la fila WQI de la reunión.
    let accHl = 0
    for (const f of Object.keys(hlDia)) {
      if (f <= fecha) accHl += hlDia[f]
    }
    const rotMtd = num(roturasMtdSerie[fecha])
    const wqiMtd =
      rotMtd != null && accHl > 0
        ? Math.round((rotMtd / accHl) * 1_000_000 * 10) / 10
        : null

    return {
      data: {
        fecha,
        bultos,
        hl_vendido: fecha in hlDia ? Math.round(hlVendidoDia * 100) / 100 : null,
        // La serie diaria no expone devoluciones (NC); el dato sólo vivía en el
        // blob. Se omite para no mezclar fuentes; el WQI no lo usa.
        devoluciones: null,
        roturas_hl: roturasDia,
        faltantes_hl: faltantesDia,
        perdidas_val: perdidasVal,
        wqi_dia: wqiDia,
        wqi_mtd: wqiMtd,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando detalle del día" }
  }
}

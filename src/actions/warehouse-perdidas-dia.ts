"use server"
/**
 * Detalle diario del tablero warehouse para el popover de /reuniones
 * (filas WQI / Roturas / Faltantes).
 *
 * Pérdidas (roturas/faltantes HL, $) salen de un blob precocido en
 * deposito-esteban (module=warehouse-dia-detalle), escrito por el pusher
 * push_warehouse_dia_detalle.ps1 que corre en la PC del depósito.
 *
 * Bultos y HL VENDIDOS, en cambio, se leen de `ventas_diarias` (el tablero,
 * misma fuente que las filas "Bultos vendidos"/"HL vendidos" y que el
 * denominador del WQI de la reunión). El WQI día/MTD se recalcula acá con ese
 * HL del tablero para que el popover coincida con la fila WQI, en vez de usar
 * el HL despachado de deposito-esteban (que daba números distintos).
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

interface BlobDia {
  bultos?: number | null
  devoluciones?: number | null
  roturas_hl?: number | null
  faltantes_hl?: number | null
  perdidas_val?: number | null
  wqi_dia?: number | null
  wqi_mtd?: number | null
}

interface BlobResp {
  data?: {
    anio?: number
    dias?: Record<string, BlobDia>
  } | null
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

    // 1) Pérdidas del día (roturas/faltantes/$ ) desde el blob precocido.
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/shared/load?module=warehouse-dia-detalle`,
      { cache: "no-store" },
    )
    if (!res.ok) return { error: `No se pudo cargar el detalle (HTTP ${res.status})` }
    const json = (await res.json()) as BlobResp
    const dias = json.data?.dias ?? {}
    const dia = dias[fecha]

    // 2) Bultos + HL vendidos del TABLERO (ventas_diarias), por día del mes.
    const supabase = await createClient()
    const [y, m] = fecha.split("-")
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
    const roturasDia = num(dia?.roturas_hl)

    // WQI del día = HL roturas día ÷ HL vendidos día (tablero) × 1M.
    const wqiDia =
      roturasDia != null
        ? hlVendidoDia > 0
          ? Math.round((roturasDia / hlVendidoDia) * 1_000_000 * 10) / 10
          : roturasDia === 0
            ? 0
            : null
        : null

    // WQI MTD = Σ HL roturas (blob) ÷ Σ HL vendidos (tablero) hasta la fecha
    // inclusive. Mismo criterio que la fila WQI de la reunión.
    let accRot = 0
    let accHl = 0
    let hayRot = false
    const fechas = new Set([...Object.keys(dias), ...Object.keys(hlDia)])
    for (const f of [...fechas].sort()) {
      if (f > fecha) continue
      const r = num(dias[f]?.roturas_hl)
      if (r != null) {
        accRot += r
        hayRot = true
      }
      accHl += hlDia[f] ?? 0
    }
    const wqiMtd =
      hayRot && accHl > 0
        ? Math.round((accRot / accHl) * 1_000_000 * 10) / 10
        : null

    return {
      data: {
        fecha,
        bultos,
        hl_vendido: fecha in hlDia ? Math.round(hlVendidoDia * 100) / 100 : null,
        devoluciones: num(dia?.devoluciones),
        roturas_hl: num(dia?.roturas_hl),
        faltantes_hl: num(dia?.faltantes_hl),
        perdidas_val: num(dia?.perdidas_val),
        wqi_dia: wqiDia,
        wqi_mtd: wqiMtd,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando detalle del día" }
  }
}

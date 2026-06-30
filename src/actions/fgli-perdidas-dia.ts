"use server"
/**
 * Detalle diario de FGLI (todas las pérdidas) para el popover de la celda FGLI
 * en la reunión de logística.
 *
 * Fuente: serie diaria de deposito-esteban (`/api/indicadores/serie-diaria`),
 * que expone por día y por tipo (rotura / faltante / vencido): HL del día, $ y
 * el detalle por SKU. Vencido = toda pérdida que no es rotura ni faltante, así
 * rotura+faltante+vencido = FGLI exacto.
 *
 * Todo es del DÍA clickeado. Cada tipo se compara contra un target DIARIO:
 *  - en HL: presupuesto mensual del tipo ÷ días del mes.
 *  - en PPM: la tasa presupuestada (HL presup. mes ÷ HL venta esperada × 1M),
 *    que no depende de la cantidad de días. El PPM de la rotura es el WQI.
 * El PPM real del día usa el HL vendido de `ventas_diarias` (igual que el WQI).
 */
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  getVentasHlEsperadas,
  type RoturaDetalleSku,
} from "@/lib/warehouse/auto-indicadores"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

/** Una categoría de pérdida del día con su valor (HL/PPM/bultos/$), su target
 *  diario (HL y PPM) y el detalle por SKU del día. */
export interface FgliTipoPerdida {
  hl: number | null
  ppm: number | null
  bultos: number
  valor: number
  /** Target diario en HL = presupuesto mensual ÷ días del mes. */
  target_hl: number | null
  /** Target en PPM (tasa presupuestada del mes, no se prorratea). */
  target_ppm: number | null
  detalle: RoturaDetalleSku[]
}

export interface FgliPerdidasDia {
  fecha: string
  total: {
    hl: number | null
    bultos: number
    valor: number | null
    /** Target diario del FGLI en HL. */
    target_hl: number | null
  }
  rotura: FgliTipoPerdida
  faltante: FgliTipoPerdida
  vencido: FgliTipoPerdida
}

interface SerieDiariaResp {
  fgli_dia?: Record<string, number | null>
  scl_dia?: Record<string, number | null>
  roturas_dia?: Record<string, number | null>
  faltantes_dia?: Record<string, number | null>
  vencidos_dia?: Record<string, number | null>
  roturas_detalle_dia?: Record<string, RoturaDetalleSku[]>
  faltantes_detalle_dia?: Record<string, RoturaDetalleSku[]>
  vencidos_detalle_dia?: Record<string, RoturaDetalleSku[]>
  targets?: {
    roturas?: number | null
    faltantes?: number | null
    vencidos?: number | null
    fgli?: number | null
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function ppm(hl: number | null, hlVendido: number | null): number | null {
  if (hl == null || hlVendido == null || hlVendido <= 0) return null
  return Math.round((hl / hlVendido) * 1_000_000 * 10) / 10
}

export async function getFgliPerdidasDia(
  fecha: string | null,
): Promise<{ data: FgliPerdidasDia | null } | { error: string }> {
  try {
    await requireAuth()
    if (!fecha) return { data: null }

    const [y, m] = fecha.split("-")
    const year = Number(y)
    const month = Number(m)
    // Días del mes (denominador del target diario en HL).
    const diasMes = new Date(year, month, 0).getDate()

    const [res, ventasEsperadas] = await Promise.all([
      fetch(
        `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
        { cache: "no-store" },
      ),
      getVentasHlEsperadas(year, month),
    ])
    if (!res.ok)
      return { error: `No se pudo cargar el detalle (HTTP ${res.status})` }
    const serie = (await res.json()) as SerieDiariaResp

    // HL vendido del tablero (ventas_diarias) del día = denominador del PPM real.
    const supabase = await createClient()
    const { data: vd } = await supabase
      .from("ventas_diarias")
      .select("fecha, total_hl")
      .eq("fecha", fecha)
    let hlVendidoDia: number | null = null
    for (const v of (vd ?? []) as Array<{ fecha: string; total_hl: number | null }>) {
      const h = Number(v.total_hl ?? 0)
      if (Number.isFinite(h)) hlVendidoDia = (hlVendidoDia ?? 0) + h
    }

    function targetDiarioHl(presupMes: number | null): number | null {
      if (presupMes == null || diasMes <= 0) return null
      return Math.round((presupMes / diasMes) * 10000) / 10000
    }

    function buildTipo(
      dia: number | null,
      presupMes: number | null,
      detalle: RoturaDetalleSku[],
    ): FgliTipoPerdida {
      let bultos = 0
      let valor = 0
      for (const d of detalle) {
        if (Number.isFinite(d.bultos)) bultos += d.bultos
        if (typeof d.valor === "number" && Number.isFinite(d.valor)) valor += d.valor
      }
      return {
        hl: dia,
        ppm: ppm(dia, hlVendidoDia),
        bultos: Math.round(bultos * 100) / 100,
        valor: Math.round(valor * 100) / 100,
        target_hl: targetDiarioHl(presupMes),
        target_ppm: ppm(presupMes, ventasEsperadas),
        detalle,
      }
    }

    const rotura = buildTipo(
      num(serie.roturas_dia?.[fecha]),
      num(serie.targets?.roturas),
      serie.roturas_detalle_dia?.[fecha] ?? [],
    )
    const faltante = buildTipo(
      num(serie.faltantes_dia?.[fecha]),
      num(serie.targets?.faltantes),
      serie.faltantes_detalle_dia?.[fecha] ?? [],
    )
    const vencido = buildTipo(
      num(serie.vencidos_dia?.[fecha]),
      num(serie.targets?.vencidos),
      serie.vencidos_detalle_dia?.[fecha] ?? [],
    )

    const totalBultos =
      Math.round((rotura.bultos + faltante.bultos + vencido.bultos) * 100) / 100

    return {
      data: {
        fecha,
        total: {
          hl: num(serie.fgli_dia?.[fecha]),
          bultos: totalBultos,
          valor: num(serie.scl_dia?.[fecha]),
          target_hl: targetDiarioHl(num(serie.targets?.fgli)),
        },
        rotura,
        faltante,
        vencido,
      },
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Error cargando detalle del día",
    }
  }
}

"use server"
/**
 * Detalle diario de FGLI (todas las pérdidas) para el popover de la celda FGLI
 * en la reunión de logística.
 *
 * Fuente: serie diaria de deposito-esteban (`/api/indicadores/serie-diaria`),
 * que expone por día y por tipo (rotura / faltante / vencido): HL del día y MTD,
 * $ y el detalle por SKU. Vencido = toda pérdida que no es rotura ni faltante,
 * así rotura+faltante+vencido = FGLI exacto.
 *
 * Para cada tipo se devuelve, además del día, una comparación del acumulado del
 * mes (real) contra el presupuesto, en HL y en PPM. El PPM = HL ÷ HL vendido
 * × 1M: el real usa el HL vendido de `ventas_diarias` (igual que el WQI que
 * estaba en el tablero), y el target usa el HL de venta esperado del mes (mismo
 * denominador que el target del WQI). El PPM de la rotura es el WQI.
 */
import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import {
  getVentasHlEsperadas,
  type RoturaDetalleSku,
} from "@/lib/warehouse/auto-indicadores"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

/** Una categoría de pérdida con su valor del día, el acumulado del mes y el
 *  presupuesto, en HL y en PPM, más el detalle por SKU del día. */
export interface FgliTipoPerdida {
  /** Del día clickeado. */
  hl: number | null
  ppm: number | null
  bultos: number
  valor: number
  /** Acumulado del mes a la fecha (real) vs presupuesto del mes. */
  mtd_hl: number | null
  mtd_ppm: number | null
  presup_hl: number | null
  presup_ppm: number | null
  /** Detalle por SKU del día clickeado. */
  detalle: RoturaDetalleSku[]
  /** Detalle por SKU acumulado del mes a la fecha (para analizar el desvío). */
  detalle_mes: RoturaDetalleSku[]
}

export interface FgliPerdidasDia {
  fecha: string
  /** Total perdido el día + acumulado vs presupuesto del FGLI. */
  total: {
    hl: number | null
    bultos: number
    valor: number | null
    mtd_hl: number | null
    presup_hl: number | null
  }
  rotura: FgliTipoPerdida
  faltante: FgliTipoPerdida
  vencido: FgliTipoPerdida
}

interface SerieDiariaResp {
  fgli?: Record<string, number | null>
  fgli_dia?: Record<string, number | null>
  scl_dia?: Record<string, number | null>
  roturas?: Record<string, number | null>
  faltantes?: Record<string, number | null>
  vencidos?: Record<string, number | null>
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

/** Acumula el detalle por SKU de todos los días del mes hasta `fecha` (incl.). */
function acumularMes(
  porDia: Record<string, RoturaDetalleSku[]> | undefined,
  fecha: string,
): RoturaDetalleSku[] {
  const acc: Record<string, Required<RoturaDetalleSku>> = {}
  for (const [f, arr] of Object.entries(porDia ?? {})) {
    if (f > fecha) continue
    for (const d of arr ?? []) {
      const a =
        acc[d.sku] ??
        (acc[d.sku] = {
          sku: d.sku,
          descripcion: d.descripcion,
          bultos: 0,
          unidades: 0,
          hl: 0,
          valor: 0,
        })
      a.bultos += d.bultos
      a.unidades += d.unidades
      a.hl += d.hl
      a.valor += d.valor ?? 0
    }
  }
  return Object.values(acc)
    .map((a) => ({
      sku: a.sku,
      descripcion: a.descripcion,
      bultos: Math.round(a.bultos * 100) / 100,
      unidades: Math.round(a.unidades * 100) / 100,
      hl: Math.round(a.hl * 10000) / 10000,
      valor: Math.round(a.valor * 100) / 100,
    }))
    .sort((x, y) => y.hl - x.hl)
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

    // HL vendidos del tablero (ventas_diarias): del día y acumulado del mes a la
    // fecha (denominador del PPM real, igual que el WQI que estaba en el tablero).
    const supabase = await createClient()
    const { data: vd } = await supabase
      .from("ventas_diarias")
      .select("fecha, total_hl")
      .gte("fecha", `${y}-${m}-01`)
      .lte("fecha", `${y}-${m}-31`)
    const hlDiaMap: Record<string, number> = {}
    for (const v of (vd ?? []) as Array<{ fecha: string; total_hl: number | null }>) {
      const h = Number(v.total_hl ?? 0)
      if (Number.isFinite(h)) hlDiaMap[v.fecha] = (hlDiaMap[v.fecha] ?? 0) + h
    }
    const hlVendidoDia = hlDiaMap[fecha] ?? null
    let hlVendidoMtd = 0
    for (const f of Object.keys(hlDiaMap)) {
      if (f <= fecha) hlVendidoMtd += hlDiaMap[f]
    }

    function buildTipo(
      dia: number | null,
      mtd: number | null,
      presup: number | null,
      detalle: RoturaDetalleSku[],
      detalleMes: RoturaDetalleSku[],
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
        mtd_hl: mtd,
        mtd_ppm: ppm(mtd, hlVendidoMtd > 0 ? hlVendidoMtd : null),
        presup_hl: presup,
        presup_ppm: ppm(presup, ventasEsperadas),
        detalle,
        detalle_mes: detalleMes,
      }
    }

    const rotura = buildTipo(
      num(serie.roturas_dia?.[fecha]),
      num(serie.roturas?.[fecha]),
      num(serie.targets?.roturas),
      serie.roturas_detalle_dia?.[fecha] ?? [],
      acumularMes(serie.roturas_detalle_dia, fecha),
    )
    const faltante = buildTipo(
      num(serie.faltantes_dia?.[fecha]),
      num(serie.faltantes?.[fecha]),
      num(serie.targets?.faltantes),
      serie.faltantes_detalle_dia?.[fecha] ?? [],
      acumularMes(serie.faltantes_detalle_dia, fecha),
    )
    const vencido = buildTipo(
      num(serie.vencidos_dia?.[fecha]),
      num(serie.vencidos?.[fecha]),
      num(serie.targets?.vencidos),
      serie.vencidos_detalle_dia?.[fecha] ?? [],
      acumularMes(serie.vencidos_detalle_dia, fecha),
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
          mtd_hl: num(serie.fgli?.[fecha]),
          presup_hl: num(serie.targets?.fgli),
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

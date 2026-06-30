"use server"
/**
 * Detalle diario de FGLI (todas las pérdidas) para el popover de la celda FGLI
 * en la reunión de logística.
 *
 * Misma fuente que la fila FGLI del tablero: la serie diaria de deposito-esteban
 * (`/api/indicadores/serie-diaria`). El endpoint expone, por día y por tipo de
 * pérdida (rotura / faltante / vencido): HL (roturas_dia/faltantes_dia/
 * vencidos_dia), $ y el detalle por SKU (*_detalle_dia, con bultos/unidades/hl/
 * valor). El total del día = FGLI en HL (fgli_dia) y SCL en $ (scl_dia).
 *
 * Vencido = toda pérdida que no es rotura ni faltante, de modo que
 * rotura+faltante+vencido = FGLI exacto (lo garantiza el endpoint).
 */
import { requireAuth } from "@/lib/session"
import type { RoturaDetalleSku } from "@/lib/warehouse/auto-indicadores"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

/** Una categoría de pérdida del día con su total y el detalle por SKU. */
export interface FgliTipoPerdida {
  hl: number | null
  bultos: number
  valor: number
  detalle: RoturaDetalleSku[]
}

export interface FgliPerdidasDia {
  fecha: string
  /** Total perdido el día (todas las categorías). */
  total: { hl: number | null; bultos: number; valor: number | null }
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
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function buildTipo(
  hl: number | null,
  detalle: RoturaDetalleSku[],
): FgliTipoPerdida {
  let bultos = 0
  let valor = 0
  for (const d of detalle) {
    if (Number.isFinite(d.bultos)) bultos += d.bultos
    if (typeof d.valor === "number" && Number.isFinite(d.valor)) valor += d.valor
  }
  return {
    hl,
    bultos: Math.round(bultos * 100) / 100,
    valor: Math.round(valor * 100) / 100,
    detalle,
  }
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

    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      { cache: "no-store" },
    )
    if (!res.ok)
      return { error: `No se pudo cargar el detalle (HTTP ${res.status})` }
    const serie = (await res.json()) as SerieDiariaResp

    const rotura = buildTipo(
      num(serie.roturas_dia?.[fecha]),
      serie.roturas_detalle_dia?.[fecha] ?? [],
    )
    const faltante = buildTipo(
      num(serie.faltantes_dia?.[fecha]),
      serie.faltantes_detalle_dia?.[fecha] ?? [],
    )
    const vencido = buildTipo(
      num(serie.vencidos_dia?.[fecha]),
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

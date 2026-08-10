"use server"
/**
 * Detalle diario de pérdidas para el popover de /reuniones (celdas WQI y
 * Faltantes, tanto en warehouse como en logística).
 *
 * Sirve a dos vistas del diálogo, que eligen qué campos leer según el
 * indicador clickeado:
 *   - WQI/Roturas → los `wqi_*` / `roturas_*` de abajo.
 *   - Faltantes   → los `faltantes_*`. Van en HL, sin PPM: el indicador
 *     `auto_faltantes` se mide y se compara contra su target en HL.
 *
 * Muestra las dos lecturas del mismo día, con el MISMO denominador (HL
 * entregado) para que sean comparables entre sí:
 *
 *   1. WQI total (volumen afectado) = HL que entra a reempaque + roturas que no
 *      pasan por el sector. Es el valor de la celda sobre la que se hizo click.
 *   2. Roturas reales (merma final del almacén) = lo que se termina
 *      descartando. Es el WQI a la vieja usanza, el que ya miden FGLI y SCL.
 *
 * Todo sale de la serie diaria de deposito-esteban
 * (`/api/indicadores/serie-diaria`), la misma fuente que alimenta la fila de la
 * grilla ⇒ el popover nunca puede contradecir a la celda.
 *
 * 🚨 Los pares PPM/HL van apareados por origen, no mezclados:
 *   - `wqi_dia` (PPM) ↔ HL afectado, que se despeja de la propia definición
 *     (PPM × HL entregado ÷ 1M) porque la serie no publica el numerador suelto.
 *   - `wqi_merma_final_dia` (PPM) ↔ `roturas_almacen_dia` (HL). Ojo: NO es
 *     `roturas_dia`, que incluye las roturas de la calle (esas van al DQI).
 */
import { requireAuth } from "@/lib/session"
import type { RoturaDetalleSku } from "@/lib/warehouse/auto-indicadores"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

export interface WarehousePerdidasDia {
  fecha: string
  /** WQI total del día en PPM (volumen afectado). */
  wqi_dia: number | null
  /** WQI total acumulado del mes hasta ese día, en PPM. */
  wqi_mtd: number | null
  /** HL afectados del día (numerador del WQI total). */
  wqi_hl_dia: number | null
  /** De esos HL, los que entraron a reempaque (el resto son roturas directas). */
  reempaque_hl_dia: number | null
  /** Roturas reales del día (merma final del almacén) en PPM. */
  roturas_ppm_dia: number | null
  /** Roturas reales acumuladas del mes hasta ese día, en PPM. */
  roturas_ppm_mtd: number | null
  /** HL de roturas reales del día (almacén, sin la calle). */
  roturas_hl_dia: number | null
  /** Qué se rompió ese día, agregado por SKU y origen (ordenado por HL desc). */
  roturas_detalle: RoturaDetalleSku[]
  /** HL de faltantes del día. */
  faltantes_hl_dia: number | null
  /** HL de faltantes acumulados del mes hasta ese día. */
  faltantes_hl_mtd: number | null
  /** Qué faltó ese día, agregado por SKU (ordenado por HL desc). */
  faltantes_detalle: RoturaDetalleSku[]
}

interface SerieDiariaResp {
  /** WQI (volumen afectado) del día y acumulado MTD, en PPM. */
  wqi_dia?: Record<string, number | null>
  wqi?: Record<string, number | null>
  /** WQI a la vieja usanza (merma final del almacén), día y MTD, en PPM. */
  wqi_merma_final_dia?: Record<string, number | null>
  wqi_merma_final?: Record<string, number | null>
  /** HL de roturas de almacén: el numerador de la merma final. */
  roturas_almacen_dia?: Record<string, number | null>
  /** HL que entró a reempaque ese día (ya neto de traslados en bloque). */
  reempaque_hl_dia?: Record<string, number | null>
  /** Denominador del WQI: HL entregado del día. */
  hl_entregado_dia?: Record<string, number | null>
  /** Detalle de roturas por SKU de cada día. */
  roturas_detalle_dia?: Record<string, RoturaDetalleSku[]>
  /** HL de faltantes del día y acumulado MTD. Misma fuente y mismo filtrado
   *  que la fila `auto_faltantes` de la grilla. */
  faltantes_dia?: Record<string, number | null>
  faltantes?: Record<string, number | null>
  /** Detalle de faltantes por SKU de cada día (sin `origen`: un faltante no
   *  se abre por almacén/distribución como las roturas). */
  faltantes_detalle_dia?: Record<string, RoturaDetalleSku[]>
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function redondear(v: number | null, dec: number): number | null {
  if (v == null) return null
  const f = 10 ** dec
  return Math.round(v * f) / f
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

    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/indicadores/serie-diaria?year=${year}&month=${month}`,
      { cache: "no-store" },
    )
    if (!res.ok) return { error: `No se pudo cargar el detalle (HTTP ${res.status})` }
    const serie = (await res.json()) as SerieDiariaResp

    const wqiDia = num(serie.wqi_dia?.[fecha])
    const hlEntregadoDia = num(serie.hl_entregado_dia?.[fecha])
    // El numerador del WQI no viaja suelto en la serie: se despeja de su propia
    // definición (PPM = HL afectado ÷ HL entregado × 1M). El PPM viene con un
    // decimal, así que el error del despeje es del orden de 1e-4 HL.
    const wqiHlDia =
      wqiDia != null && hlEntregadoDia != null && hlEntregadoDia > 0
        ? (wqiDia * hlEntregadoDia) / 1_000_000
        : null

    return {
      data: {
        fecha,
        wqi_dia: wqiDia,
        wqi_mtd: num(serie.wqi?.[fecha]),
        wqi_hl_dia: redondear(wqiHlDia, 4),
        reempaque_hl_dia: num(serie.reempaque_hl_dia?.[fecha]),
        roturas_ppm_dia: num(serie.wqi_merma_final_dia?.[fecha]),
        roturas_ppm_mtd: num(serie.wqi_merma_final?.[fecha]),
        roturas_hl_dia: num(serie.roturas_almacen_dia?.[fecha]),
        roturas_detalle: serie.roturas_detalle_dia?.[fecha] ?? [],
        faltantes_hl_dia: num(serie.faltantes_dia?.[fecha]),
        faltantes_hl_mtd: num(serie.faltantes?.[fecha]),
        faltantes_detalle: serie.faltantes_detalle_dia?.[fecha] ?? [],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando detalle del día" }
  }
}

"use server"
/**
 * Detalle diario del tablero warehouse para el popover de /reuniones
 * (filas WQI / Roturas / Faltantes). Lee un blob ya precocido en
 * deposito-esteban (module=warehouse-dia-detalle), escrito por el pusher
 * push_warehouse_dia_detalle.ps1 que corre en la PC del depósito:
 *   - bultos vendidos del día (ChessERP)
 *   - roturas / faltantes (HL), pérdidas ($), WQI del día y WQI MTD (serie-diaria)
 *
 * Es una sola lectura de un blob cocinado → liviano, sin pegarle a Chess en vivo.
 */
import { requireAuth } from "@/lib/session"

const DEPOSITO_API_BASE = "https://deposito-esteban.vercel.app"

export interface WarehousePerdidasDia {
  fecha: string
  bultos: number | null
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
    const res = await fetch(
      `${DEPOSITO_API_BASE}/api/shared/load?module=warehouse-dia-detalle`,
      { cache: "no-store" },
    )
    if (!res.ok) return { error: `No se pudo cargar el detalle (HTTP ${res.status})` }
    const json = (await res.json()) as BlobResp
    const dia = json.data?.dias?.[fecha]
    if (!dia) {
      // Día sin datos precocidos (fin de semana, futuro o aún no sembrado).
      return {
        data: {
          fecha,
          bultos: null,
          devoluciones: null,
          roturas_hl: null,
          faltantes_hl: null,
          perdidas_val: null,
          wqi_dia: null,
          wqi_mtd: null,
        },
      }
    }
    return {
      data: {
        fecha,
        bultos: num(dia.bultos),
        devoluciones: num(dia.devoluciones),
        roturas_hl: num(dia.roturas_hl),
        faltantes_hl: num(dia.faltantes_hl),
        perdidas_val: num(dia.perdidas_val),
        wqi_dia: num(dia.wqi_dia),
        wqi_mtd: num(dia.wqi_mtd),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando detalle del día" }
  }
}

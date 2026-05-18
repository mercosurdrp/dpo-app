"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/** Km máximos plausibles en un día — descarta odómetros mal cargados. */
const KM_MAX_DIA = 2000

export interface KmUnidadDetalle {
  dominio: string
  odo_liberacion: number | null
  odo_retorno: number | null
  km: number | null
  estado: "ok" | "sin_liberacion" | "sin_retorno" | "invalido"
}

export interface KmRecorridosDia {
  fecha: string
  total_km: number
  /** Unidades con km calculado válido. */
  unidades_con_km: number
  detalle: KmUnidadDetalle[]
}

/**
 * Detalle del día para el indicador "Km recorridos" del tablero de reuniones.
 * Km por unidad = odómetro del checklist de retorno − odómetro del checklist
 * de liberación, del mismo dominio y fecha.
 */
export async function getKmRecorridosDia(
  fecha: string,
): Promise<{ data: KmRecorridosDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    const { data: chkRaw, error } = await supa
      .from("checklist_vehiculos")
      .select("dominio, tipo, odometro")
      .eq("fecha", fecha)
    if (error) return { error: error.message }

    // Agrupar odómetros por dominio
    const porDom: Record<string, { lib: number[]; ret: number[] }> = {}
    for (const r of (chkRaw ?? []) as Array<{
      dominio: string | null
      tipo: string
      odometro: number | null
    }>) {
      const dom = (r.dominio ?? "").trim().toUpperCase()
      if (!dom) continue
      if (r.odometro == null || !Number.isFinite(r.odometro)) continue
      if (!porDom[dom]) porDom[dom] = { lib: [], ret: [] }
      if (r.tipo === "liberacion") porDom[dom].lib.push(r.odometro)
      else if (r.tipo === "retorno") porDom[dom].ret.push(r.odometro)
    }

    let totalKm = 0
    let unidadesConKm = 0
    const detalle: KmUnidadDetalle[] = Object.keys(porDom)
      .sort()
      .map((dom) => {
        const { lib, ret } = porDom[dom]
        const odoLib = lib.length > 0 ? Math.min(...lib) : null
        const odoRet = ret.length > 0 ? Math.max(...ret) : null

        let estado: KmUnidadDetalle["estado"]
        let km: number | null = null
        if (odoLib == null) {
          estado = "sin_liberacion"
        } else if (odoRet == null) {
          estado = "sin_retorno"
        } else {
          km = odoRet - odoLib
          if (km > 0 && km <= KM_MAX_DIA) {
            estado = "ok"
            totalKm += km
            unidadesConKm++
          } else {
            estado = "invalido"
          }
        }
        return {
          dominio: dom,
          odo_liberacion: odoLib,
          odo_retorno: odoRet,
          km,
          estado,
        }
      })

    return {
      data: { fecha, total_km: totalKm, unidades_con_km: unidadesConKm, detalle },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando los km recorridos del día",
    }
  }
}

"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/** Horas máximas plausibles en la calle en un día — descarta marcas mal cargadas. */
const HORAS_MAX_DIA = 18

export interface HorasUnidadDetalle {
  dominio: string
  hora_liberacion: string | null
  hora_retorno: string | null
  horas: number | null
  estado: "ok" | "sin_liberacion" | "sin_retorno" | "invalido"
}

export interface HorasCalleDia {
  fecha: string
  promedio_horas: number
  /** Unidades con horas calculadas válidas. */
  unidades_con_horas: number
  detalle: HorasUnidadDetalle[]
}

/**
 * Detalle del día para el indicador "Horas en la calle" del tablero de
 * reuniones. Horas por unidad = hora del checklist de retorno − hora del
 * checklist de liberación, del mismo dominio y fecha.
 */
export async function getHorasCalleDia(
  fecha: string,
): Promise<{ data: HorasCalleDia } | { error: string }> {
  try {
    await requireAuth()
    const supa = await createClient()

    const { data: chkRaw, error } = await supa
      .from("checklist_vehiculos")
      .select("dominio, tipo, hora")
      .eq("fecha", fecha)
    if (error) return { error: error.message }

    // Agrupar marcas horarias por dominio
    const porDom: Record<string, { lib: number[]; ret: number[] }> = {}
    for (const r of (chkRaw ?? []) as Array<{
      dominio: string | null
      tipo: string
      hora: string | null
    }>) {
      const dom = (r.dominio ?? "").trim().toUpperCase()
      if (!dom) continue
      if (!r.hora) continue
      const t = new Date(r.hora).getTime()
      if (!Number.isFinite(t)) continue
      if (!porDom[dom]) porDom[dom] = { lib: [], ret: [] }
      if (r.tipo === "liberacion") porDom[dom].lib.push(t)
      else if (r.tipo === "retorno") porDom[dom].ret.push(t)
    }

    let sumaHoras = 0
    let unidadesConHoras = 0
    const detalle: HorasUnidadDetalle[] = Object.keys(porDom)
      .sort()
      .map((dom) => {
        const { lib, ret } = porDom[dom]
        // Liberación = primera marca del día; retorno = última.
        const tLib = lib.length > 0 ? Math.min(...lib) : null
        const tRet = ret.length > 0 ? Math.max(...ret) : null

        let estado: HorasUnidadDetalle["estado"]
        let horas: number | null = null
        if (tLib == null) {
          estado = "sin_liberacion"
        } else if (tRet == null) {
          estado = "sin_retorno"
        } else {
          horas = (tRet - tLib) / 3_600_000
          if (horas > 0 && horas <= HORAS_MAX_DIA) {
            estado = "ok"
            sumaHoras += horas
            unidadesConHoras++
          } else {
            estado = "invalido"
          }
        }
        return {
          dominio: dom,
          hora_liberacion: tLib == null ? null : new Date(tLib).toISOString(),
          hora_retorno: tRet == null ? null : new Date(tRet).toISOString(),
          horas: horas == null ? null : Math.round(horas * 10) / 10,
          estado,
        }
      })

    return {
      data: {
        fecha,
        promedio_horas:
          unidadesConHoras > 0
            ? Math.round((sumaHoras / unidadesConHoras) * 10) / 10
            : 0,
        unidades_con_horas: unidadesConHoras,
        detalle,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Error cargando las horas en la calle del día",
    }
  }
}

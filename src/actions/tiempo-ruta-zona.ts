"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

export type ZonaName = "Norte" | "Central" | "Este"

export interface ObjetivoTiempoRutaZona {
  zona: ZonaName
  meta_minutos: number
  tolerancia_minutos: number
  updated_at: string | null
}

const ZONAS: ZonaName[] = ["Norte", "Central", "Este"]
const DEFAULT_META = 480
const DEFAULT_TOL = 60

export type ObjetivosTiempoRuta = Record<ZonaName, ObjetivoTiempoRutaZona>

export async function getObjetivosTiempoRutaZona(): Promise<
  { data: ObjetivosTiempoRuta } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tiempo_ruta_objetivos_zona")
      .select("zona,meta_minutos,tolerancia_minutos,updated_at")
    // WHY: si la migración 061 todavía no se aplicó en esta Supabase, la tabla
    // no existe (PostgREST PGRST205). En lugar de romper la pantalla, caemos
    // a los valores default para que el tablero se renderice; el admin podrá
    // aplicar la migración después.
    if (error && error.code !== "PGRST205") return { error: error.message }

    const byZona = new Map<string, ObjetivoTiempoRutaZona>()
    for (const r of data ?? []) {
      byZona.set(r.zona, {
        zona: r.zona as ZonaName,
        meta_minutos: r.meta_minutos,
        tolerancia_minutos: r.tolerancia_minutos,
        updated_at: r.updated_at,
      })
    }

    const out = {} as ObjetivosTiempoRuta
    for (const z of ZONAS) {
      out[z] =
        byZona.get(z) ?? {
          zona: z,
          meta_minutos: DEFAULT_META,
          tolerancia_minutos: DEFAULT_TOL,
          updated_at: null,
        }
    }
    return { data: out }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function setObjetivoTiempoRutaZona(input: {
  zona: ZonaName
  meta_minutos: number
  tolerancia_minutos: number
}): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Solo admins pueden editar objetivos" }
    }
    if (!ZONAS.includes(input.zona)) {
      return { error: "Zona inválida" }
    }
    const meta = Math.round(input.meta_minutos)
    const tol = Math.round(input.tolerancia_minutos)
    if (!Number.isFinite(meta) || meta <= 0 || meta > 1440) {
      return { error: "meta_minutos fuera de rango (1..1440)" }
    }
    if (!Number.isFinite(tol) || tol < 0 || tol > 1440) {
      return { error: "tolerancia_minutos fuera de rango (0..1440)" }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("tiempo_ruta_objetivos_zona")
      .upsert(
        {
          zona: input.zona,
          meta_minutos: meta,
          tolerancia_minutos: tol,
          updated_at: new Date().toISOString(),
          updated_by: profile.id,
        },
        { onConflict: "zona" },
      )
    if (error) return { error: error.message }

    revalidatePath("/indicadores/tiempo-ruta-foxtrot")
    revalidatePath("/indicadores/tiempo-ruta-foxtrot/objetivos")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

"use server"

import { getProfile, requireAuth } from "@/lib/session"
import type { PeriodoMapaCosto } from "@/lib/fotos"
import { leerMapaCosto, renovarMapaCostoFoto, type MapaCosto } from "@/lib/costo-pdv-mapa"

export type { MapaCosto, PdvMapa } from "@/lib/costo-pdv-mapa"

const ROLES_EDITORES = ["admin", "supervisor", "admin_rrhh"]

export interface MapaCostoResultado {
  datos: MapaCosto
  /** Cuándo se generó la foto que se está mostrando. */
  generadoEn: string
  desdeFoto: boolean
}

/** Mapa del período desde la foto; si no hay foto, la calcula y la guarda. */
export async function getMapaCosto(
  periodo: PeriodoMapaCosto,
): Promise<{ data: MapaCostoResultado } | { error: string }> {
  const profile = await requireAuth()
  try {
    const r = await leerMapaCosto(periodo, profile.id)
    return { data: r }
  } catch (e) {
    console.error("[costo-pdv-mapa] getMapaCosto:", e)
    return { error: e instanceof Error ? e.message : "No se pudo armar el mapa. Probá de nuevo en un rato." }
  }
}

/** Recalcula la foto del período (sólo editores). */
export async function renovarMapaCosto(
  periodo: PeriodoMapaCosto,
): Promise<{ data: MapaCostoResultado } | { error: string }> {
  const profile = await getProfile()
  if (!profile || !ROLES_EDITORES.includes(profile.role)) {
    return { error: "No tenés permiso para renovar el mapa." }
  }
  try {
    const r = await renovarMapaCostoFoto(periodo, profile.id)
    return { data: { ...r, desdeFoto: false } }
  } catch (e) {
    console.error("[costo-pdv-mapa] renovarMapaCosto:", e)
    return { error: e instanceof Error ? e.message : "No se pudo renovar el mapa. Probá de nuevo en un rato." }
  }
}

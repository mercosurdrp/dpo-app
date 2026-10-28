"use server"

import { revalidatePath } from "next/cache"
import { getProfile, requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { claveMapaCosto, type PeriodoMapaCosto } from "@/lib/fotos"
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

// ── Conclusión escrita por período ──────────────────────────────────────────

export interface ConclusionMapa {
  texto: string
  autorNombre: string | null
  actualizadoEn: string
}

/** Tabla de la migración 20261028120000; si no está aplicada, se avisa en pantalla. */
const TABLA_CONCLUSIONES = "costo_pdv_mapa_conclusiones"
const SIN_TABLA = "Falta aplicar la migración 20261028120000 (tabla costo_pdv_mapa_conclusiones) en Supabase."

function esTablaInexistente(err: { code?: string; message?: string }) {
  return err.code === "42P01" || (err.message ?? "").includes(TABLA_CONCLUSIONES)
}

export async function getConclusionMapa(
  periodo: PeriodoMapaCosto,
): Promise<{ data: ConclusionMapa | null } | { error: string }> {
  await requireAuth()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLA_CONCLUSIONES)
    .select("texto, autor_nombre, updated_at")
    .eq("clave", claveMapaCosto(periodo))
    .maybeSingle()
  if (error) return { error: esTablaInexistente(error) ? SIN_TABLA : error.message }
  if (!data) return { data: null }
  const r = data as { texto: string; autor_nombre: string | null; updated_at: string }
  return { data: { texto: r.texto, autorNombre: r.autor_nombre, actualizadoEn: r.updated_at } }
}

export async function guardarConclusionMapa(
  periodo: PeriodoMapaCosto,
  texto: string,
): Promise<{ data: ConclusionMapa } | { error: string }> {
  const profile = await getProfile()
  if (!profile || !ROLES_EDITORES.includes(profile.role)) {
    return { error: "No tenés permiso para escribir la conclusión." }
  }
  const limpio = texto.trim()
  if (!limpio) return { error: "La conclusión no puede quedar vacía." }
  const supabase = await createClient()
  const { error } = await supabase.from(TABLA_CONCLUSIONES).upsert(
    {
      clave: claveMapaCosto(periodo),
      anio: periodo.anio,
      mes: periodo.tipo === "mes" ? periodo.mes : null,
      texto: limpio,
      autor_id: profile.id,
      autor_nombre: profile.nombre,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clave" },
  )
  if (error) return { error: esTablaInexistente(error) ? SIN_TABLA : error.message }
  revalidatePath("/planeamiento/costo-por-pdv")
  return { data: { texto: limpio, autorNombre: profile.nombre, actualizadoEn: new Date().toISOString() } }
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

"use server"
/**
 * SCI — Índice de Curva de Ventas (Planeamiento 4.3 · Entrega 3.1 · TOR Ventas-Logística).
 * Devuelve el SCI mes a mes del año pedido y del anterior más la serie diaria
 * para dibujar la curva. La carga vive en `@/lib/sci-cargar` (compartida con la
 * sección de la Reunión Ventas-Logística) y el cálculo en `@/lib/sci`.
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { cargarSciData, hoyArg, type SciData } from "@/lib/sci-cargar"

export type { SciData }

type Result<T> = { data: T } | { error: string }

export async function getSciData(params?: { anio?: number }): Promise<Result<SciData>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArg()
    const anio = params?.anio && params.anio >= 2024 && params.anio <= hoy.anio + 1 ? params.anio : hoy.anio
    return await cargarSciData(supabase, anio, hoy)
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al calcular el SCI" }
  }
}

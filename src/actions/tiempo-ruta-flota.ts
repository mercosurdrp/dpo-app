"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { tiempoRutaLimpias } from "@/lib/foxtrot/tiempo-ruta-limpias"

// Tiempo promedio en ruta (Indicadores → Flota) y el nodo "Tiempo en Ruta" del
// Árbol del Sueño: los dos leen lo mismo — ver lib/foxtrot/tiempo-ruta-limpias.ts.

export const TIEMPO_RUTA_META = 8
export const TIEMPO_RUTA_GATILLO = 8.5

export interface TiempoRutaMes {
  mes: number
  horas: number
  rutas: number
}

export interface TiempoRutaResumen {
  anio: number
  /** Promedio ponderado del año: Σ minutos ÷ Σ rutas limpias. */
  ytd: number | null
  rutas: number
  descartadas: number
  meses: TiempoRutaMes[]
}

const anioActual = () => new Date().getFullYear()

/** Promedio del año, con apertura mensual. Null si Foxtrot no trae nada. */
export async function tiempoRutaAnualFlota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  anio: number,
): Promise<TiempoRutaResumen | null> {
  const hoy = new Date().toISOString().slice(0, 10)
  const hasta = hoy < `${anio}-12-31` ? hoy : `${anio}-12-31`
  const r = await tiempoRutaLimpias(supabase, `${anio}-01-01`, hasta)
  if (!r.total) return null

  return {
    anio,
    ytd: r.total.horas,
    rutas: r.total.rutas,
    descartadas: r.descartadas,
    meses: [...r.porMes].map(([mes, a]) => ({ mes, horas: a.horas, rutas: a.rutas })),
  }
}

export async function getTiempoRutaFlota(
  anio?: number,
): Promise<{ data: TiempoRutaResumen } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const year = anio ?? anioActual()
    const data = await tiempoRutaAnualFlota(supabase, year)
    if (!data) {
      return { error: "Foxtrot no tiene rutas cerradas en el día para este año." }
    }
    return { data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error calculando el tiempo en ruta" }
  }
}

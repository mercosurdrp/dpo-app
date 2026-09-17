"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { ComparativoYtd, NpsYtdFila, RmdYtdFila } from "@/lib/ytd"

/**
 * Acumulado del año contra el mismo período del año anterior.
 *
 * Los dos acumulados los calcula la base (ver
 * APLICAR_EN_PAMPEANA_YTD_COMPARATIVO.sql): son ~17.000 puntuaciones por año y
 * traerlas para promediar en el server es justo lo que hacía lenta la app.
 *
 * Si las funciones todavía no están aplicadas en este tenant, se devuelve null
 * y la pantalla simplemente no muestra el bloque: no rompe nada.
 */

function hoyArgentinaISO(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  return partes // en-CA ya da yyyy-mm-dd
}

function armar<T extends RmdYtdFila | NpsYtdFila>(
  filas: T[],
  vacia: (anio: number) => T,
): ComparativoYtd<T> | null {
  if (!filas.length) return null
  const anios = filas.map((f) => f.anio)
  const anioActual = Math.max(...anios)
  const anioAnterior = anioActual - 1
  const actual = filas.find((f) => f.anio === anioActual) ?? vacia(anioActual)
  const anterior = filas.find((f) => f.anio === anioAnterior) ?? vacia(anioAnterior)
  return {
    actual,
    anterior,
    sinDatos: contar(anterior) === 0,
    hasta: hoyArgentinaISO(),
  }
}

/** Cuántas filas tiene el año: sirve para saber si el histórico está cargado. */
function contar(fila: RmdYtdFila | NpsYtdFila): number {
  return "puntuadas" in fila ? fila.puntuadas : fila.encuestas
}

export async function getRmdYtd(): Promise<ComparativoYtd<RmdYtdFila> | null> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("rmd_ytd_comparativo")
    if (error || !data) return null

    const filas = (data as unknown[]).map((f) => {
      const r = f as Record<string, unknown>
      return {
        anio: Number(r.anio),
        puntuadas: Number(r.puntuadas ?? 0),
        rmd: r.rmd == null ? null : Number(r.rmd),
        detractores: Number(r.detractores ?? 0),
        promotores: Number(r.promotores ?? 0),
        enviadas: Number(r.enviadas ?? 0),
      } satisfies RmdYtdFila
    })

    return armar(filas, (anio) => ({
      anio,
      puntuadas: 0,
      rmd: null,
      detractores: 0,
      promotores: 0,
      enviadas: 0,
    }))
  } catch {
    return null
  }
}

export async function getNpsYtd(): Promise<ComparativoYtd<NpsYtdFila> | null> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("nps_ytd_comparativo")
    if (error || !data) return null

    const filas = (data as unknown[]).map((f) => {
      const r = f as Record<string, unknown>
      return {
        anio: Number(r.anio),
        encuestas: Number(r.encuestas ?? 0),
        promotores: Number(r.promotores ?? 0),
        pasivos: Number(r.pasivos ?? 0),
        detractores: Number(r.detractores ?? 0),
        nps: r.nps == null ? null : Number(r.nps),
      } satisfies NpsYtdFila
    })

    return armar(filas, (anio) => ({
      anio,
      encuestas: 0,
      promotores: 0,
      pasivos: 0,
      detractores: 0,
      nps: null,
    }))
  } catch {
    return null
  }
}

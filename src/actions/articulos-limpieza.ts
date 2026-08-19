"use server"

import { requireAuth, requireRole } from "@/lib/session"
import { leerPrefijo, escribirClave, borrarClave } from "@/lib/clima-store"
import { ARTICULOS_LIMPIEZA } from "@/lib/flota/articulos-limpieza"

/**
 * Entrega de artículos de limpieza (escoba, rejilla, franela) a cada unidad.
 *
 * 🚨 Sin tabla propia: en esta VM no se puede aplicar DDL, así que las entregas
 * se guardan en la tabla KV `app_config` (una clave por entrega), igual que el
 * módulo Clima — de ahí los helpers de `lib/clima-store`. El volumen lo
 * aguanta de sobra: unas pocas entregas por mes.
 *
 * Formato: `flota:art-limpieza:<uuid>` → JSON de `EntregaArticulos`.
 * Una entrega puede llevar varios artículos (misma parada, una sola carga).
 */

const PREFIJO = "flota:art-limpieza:"

export interface EntregaArticulos {
  id: string
  /** YYYY-MM-DD */
  fecha: string
  dominio: string
  /** Ids del catálogo `ARTICULOS_LIMPIEZA`. */
  articulos: string[]
  observaciones: string | null
  /** Nombre de quien registró la entrega. */
  cargado_por: string | null
  created_at: string
}

export async function getEntregasArticulos(): Promise<
  { data: EntregaArticulos[] } | { error: string }
> {
  try {
    await requireAuth()
    const res = await leerPrefijo(PREFIJO)
    if ("error" in res) return { error: res.error }
    const entregas: EntregaArticulos[] = []
    for (const fila of res.data) {
      try {
        entregas.push(JSON.parse(fila.valor) as EntregaArticulos)
      } catch {
        // Una clave ilegible no voltea el listado entero.
      }
    }
    entregas.sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at),
    )
    return { data: entregas }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function registrarEntregaArticulos(input: {
  fecha: string
  dominio: string
  articulos: string[]
  observaciones?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])

    const fecha = input.fecha?.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Elegí la fecha" }
    const dominio = input.dominio?.trim().toUpperCase()
    if (!dominio) return { error: "Elegí la unidad" }
    const validos = new Set<string>(ARTICULOS_LIMPIEZA.map((a) => a.id))
    const articulos = Array.from(new Set(input.articulos)).filter((a) =>
      validos.has(a),
    )
    if (articulos.length === 0) return { error: "Marcá qué artículos se entregaron" }

    const id = crypto.randomUUID()
    const entrega: EntregaArticulos = {
      id,
      fecha,
      dominio,
      articulos,
      observaciones: input.observaciones?.trim() || null,
      cargado_por: profile.nombre ?? null,
      created_at: new Date().toISOString(),
    }
    const res = await escribirClave(PREFIJO + id, entrega, profile.id)
    if ("error" in res) return { error: res.error }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarEntregaArticulos(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    if (!id || id.includes("%")) return { error: "Entrega inválida" }
    const res = await borrarClave(PREFIJO + id)
    if ("error" in res) return { error: res.error }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Saca UN artículo de la última entrega que lo tenga para esa unidad.
 *
 * Es lo que hace el botón del cuadro cuando se desmarca un artículo que estaba
 * en verde. No borra la entrega entera: una misma parada suele haber entregado
 * escoba y franela juntas, y desmarcar la escoba no puede llevarse puesta la
 * franela. Si el artículo era el único de esa entrega, ahí sí se borra la clave
 * —una entrega sin artículos no dice nada—.
 */
export async function desmarcarArticuloUnidad(
  dominio: string,
  articulo: string,
): Promise<{ success: true; fecha: string } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])

    const dom = dominio?.trim().toUpperCase()
    if (!dom) return { error: "Unidad inválida" }
    if (!ARTICULOS_LIMPIEZA.some((a) => a.id === articulo))
      return { error: "Artículo inválido" }

    const res = await leerPrefijo(PREFIJO)
    if ("error" in res) return { error: res.error }

    // La más reciente que tenga ese artículo: es la que muestra el cuadro.
    let objetivo: EntregaArticulos | null = null
    for (const fila of res.data) {
      let e: EntregaArticulos
      try {
        e = JSON.parse(fila.valor) as EntregaArticulos
      } catch {
        continue
      }
      if (e.dominio !== dom || !e.articulos.includes(articulo)) continue
      if (
        !objetivo ||
        e.fecha > objetivo.fecha ||
        (e.fecha === objetivo.fecha && e.created_at > objetivo.created_at)
      )
        objetivo = e
    }
    if (!objetivo) return { error: "Esa unidad no tiene ese artículo entregado" }

    const quedan = objetivo.articulos.filter((a) => a !== articulo)
    const clave = PREFIJO + objetivo.id
    const escritura =
      quedan.length === 0
        ? await borrarClave(clave)
        : await escribirClave(clave, { ...objetivo, articulos: quedan }, profile.id)
    if ("error" in escritura) return { error: escritura.error }
    return { success: true, fecha: objetivo.fecha }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

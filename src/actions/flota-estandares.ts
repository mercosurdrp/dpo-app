"use server"

// Estándares de Flota (DPO 1.2): matriz de cumplimiento ítem × unidad,
// migrada de la planilla "ESTANDAR DE LA FLOTA" y mantenida viva contra el
// catálogo de vehículos activos. El % de conformidad (ok ÷ evaluables) es el
// KPI estandares_conformidad del tablero de Indicadores.
//
// El punto pide distinguir lo MANDATORIO de lo de EXCELENCIA, así que el % sale
// además abierto en dos: un desvío en un ítem legal o de riesgo grave no puede
// promediarse contra uno de confort. El global se mantiene por continuidad de
// la serie histórica del KPI.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

export type EstandarEstado = "ok" | "no_ok" | "na"
export type EstandarCriticidad = "mandatorio" | "excelencia"

export interface EstandarItem {
  id: string
  ambito: "camion" | "autoelevador"
  nombre: string
  productividad: string | null
  seguridad: string | null
  calidad: string | null
  orden: number
  activo: boolean
  criticidad: EstandarCriticidad
}

export interface EstandarCumplimiento {
  dominio: string
  item_id: string
  estado: EstandarEstado
  observaciones: string | null
}

export interface EstandarUnidad {
  dominio: string
  tipo: "camion" | "autoelevador"
}

/**
 * Última vez que se tocó la matriz de una unidad. El "cómo verificar" del punto
 * 1.2 pide un check de conformidad **interno y mensual**: tener la matriz
 * cargada no alcanza si la última revisión es de hace tres meses. Esto es lo
 * que convierte "lo tengo" en "lo gestiono".
 */
export interface EstandarRevision {
  dominio: string
  ultima: string | null
  diasDesde: number | null
  /** Revisada dentro de los últimos 30 días. */
  alDia: boolean
}

export interface EstandaresFlota {
  items: EstandarItem[]
  cumplimiento: EstandarCumplimiento[]
  unidades: EstandarUnidad[]
  /** % de ítems OK sobre evaluables (ok + no_ok) de unidades activas. */
  pct: number | null
  /** Mismo cálculo, sólo sobre los ítems mandatorios. */
  pctMandatorio: number | null
  /** Mismo cálculo, sólo sobre los ítems de excelencia. */
  pctExcelencia: number | null
  /** Antigüedad de la revisión de cada unidad activa. */
  revisiones: EstandarRevision[]
}

export async function getEstandaresFlota(): Promise<
  { data: EstandaresFlota } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const [itemsRes, cumplRes, vehRes] = await Promise.all([
      supabase
        .from("flota_estandar_items")
        .select("*")
        .eq("activo", true)
        .order("orden"),
      supabase
        .from("flota_estandar_cumplimiento")
        .select("dominio, item_id, estado, observaciones, updated_at")
        .limit(5000),
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo")
        .eq("active", true)
        .in("tipo", ["camion", "autoelevador"])
        .order("dominio"),
    ])
    if (itemsRes.error) return { error: itemsRes.error.message }
    if (cumplRes.error) return { error: cumplRes.error.message }
    if (vehRes.error) return { error: vehRes.error.message }

    const items = (itemsRes.data || []) as EstandarItem[]
    const unidades = (vehRes.data || []) as EstandarUnidad[]
    const dominiosActivos = new Set(unidades.map((u) => u.dominio))
    const itemIds = new Set(items.map((i) => i.id))
    const filas = (cumplRes.data || []) as Array<
      EstandarCumplimiento & { updated_at: string | null }
    >
    const cumplimiento = filas.filter(
      (c) => dominiosActivos.has(c.dominio) && itemIds.has(c.item_id)
    )

    // Última marca de tiempo por unidad: la revisión de la unidad es la más
    // reciente de sus ítems.
    const ultimaPorDominio = new Map<string, string>()
    for (const c of cumplimiento) {
      if (!c.updated_at) continue
      const previa = ultimaPorDominio.get(c.dominio)
      if (!previa || c.updated_at > previa) ultimaPorDominio.set(c.dominio, c.updated_at)
    }
    const ahora = Date.now()
    const revisiones: EstandarRevision[] = unidades.map((u) => {
      const ultima = ultimaPorDominio.get(u.dominio) ?? null
      const diasDesde = ultima
        ? Math.floor((ahora - new Date(ultima).getTime()) / 86400000)
        : null
      return {
        dominio: u.dominio,
        ultima,
        diasDesde,
        alDia: diasDesde != null && diasDesde <= 30,
      }
    })

    const criticidadDe = new Map(items.map((i) => [i.id, i.criticidad]))
    // [ok, no_ok] global y por criticidad. Los N/A quedan fuera del denominador
    // en los tres, como siempre: un ítem que no aplica al modal no es un desvío.
    const conteo: Record<string, [number, number]> = {
      total: [0, 0],
      mandatorio: [0, 0],
      excelencia: [0, 0],
    }
    const sumar = (bucket: [number, number] | undefined, estado: EstandarEstado) => {
      if (!bucket) return
      if (estado === "ok") bucket[0]++
      else if (estado === "no_ok") bucket[1]++
    }
    for (const c of cumplimiento) {
      sumar(conteo.total, c.estado)
      sumar(conteo[criticidadDe.get(c.item_id) ?? ""], c.estado)
    }
    const porcentaje = ([ok, noOk]: [number, number]) =>
      ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null

    return {
      data: {
        items,
        cumplimiento,
        unidades,
        pct: porcentaje(conteo.total),
        pctMandatorio: porcentaje(conteo.mandatorio),
        pctExcelencia: porcentaje(conteo.excelencia),
        revisiones,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Cambia la criticidad de un ítem del estándar (R1.2.1: el estándar se controla
 * electrónicamente, así que la clasificación se mantiene en la pantalla y no en
 * una migración). Sólo el Gestor de Flota — admin o supervisor.
 */
export async function setEstandarCriticidad(input: {
  itemId: string
  criticidad: EstandarCriticidad
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("flota_estandar_items")
      .update({ criticidad: input.criticidad })
      .eq("id", input.itemId)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Upsert del estado de un ítem para una unidad (click en la celda). */
export async function setEstandarEstado(input: {
  dominio: string
  itemId: string
  estado: EstandarEstado
  observaciones?: string | null
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const row: Record<string, unknown> = {
      dominio: input.dominio,
      item_id: input.itemId,
      estado: input.estado,
      updated_by: profile.id,
    }
    if (input.observaciones !== undefined) row.observaciones = input.observaciones
    const { error } = await supabase
      .from("flota_estandar_cumplimiento")
      .upsert(row, { onConflict: "dominio,item_id" })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

"use server"

// Estándares de Flota (DPO 1.2): matriz de cumplimiento ítem × unidad,
// migrada de la planilla "ESTANDAR DE LA FLOTA" y mantenida viva contra el
// catálogo de vehículos activos. El % de conformidad (ok ÷ evaluables) es el
// KPI estandares_conformidad del tablero de Indicadores.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

export type EstandarEstado = "ok" | "no_ok" | "na"

export interface EstandarItem {
  id: string
  ambito: "camion" | "autoelevador"
  nombre: string
  productividad: string | null
  seguridad: string | null
  calidad: string | null
  orden: number
  activo: boolean
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

export interface EstandaresFlota {
  items: EstandarItem[]
  cumplimiento: EstandarCumplimiento[]
  unidades: EstandarUnidad[]
  /** % de ítems OK sobre evaluables (ok + no_ok) de unidades activas. */
  pct: number | null
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
        .select("dominio, item_id, estado, observaciones")
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
    const cumplimiento = ((cumplRes.data || []) as EstandarCumplimiento[]).filter(
      (c) => dominiosActivos.has(c.dominio) && itemIds.has(c.item_id)
    )

    let ok = 0
    let noOk = 0
    for (const c of cumplimiento) {
      if (c.estado === "ok") ok++
      else if (c.estado === "no_ok") noOk++
    }
    const pct = ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null

    return { data: { items, cumplimiento, unidades, pct } }
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

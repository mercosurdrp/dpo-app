"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  consultarAvanceEmpresa,
  type AvanceCategoria,
  type CategoriaVenta,
} from "@/lib/mercosur-dashboard"

type Result<T> = { data: T } | { error: string }

export interface AvanceVentaSnapshot {
  id: string
  reunion_id: string
  anio: number
  mes: number
  desde: string | null
  hasta: string | null
  peso_habiles: number
  peso_trabajados: number
  objetivo_total_hl: number
  real_total_hl: number
  tendencia_total_hl: number
  pct_avance_total: number
  objetivo_disponible: boolean
  origen: "manual" | "auto"
  updated_at: string
  detalle: AvanceCategoria[]
}

export interface AvanceVentaComparacion {
  anterior_fecha: string
  anterior_real_total_hl: number
  anterior_pct_avance_total: number
  anterior_mes: number
  anterior_anio: number
}

export interface AvanceVentaData {
  snapshot: AvanceVentaSnapshot | null
  comparacion: AvanceVentaComparacion | null
}

const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo editores pueden modificar la sección de avance de venta")
  }
  return profile
}

type SupaClient = Awaited<ReturnType<typeof createClient>>

async function cargarSnapshot(
  supabase: SupaClient,
  reunionId: string,
): Promise<AvanceVentaSnapshot | null> {
  const { data: snap } = await supabase
    .from("reunion_avance_venta_snapshots")
    .select("*")
    .eq("reunion_id", reunionId)
    .maybeSingle()
  if (!snap) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = snap as any
  const { data: det } = await supabase
    .from("reunion_avance_venta_detalle")
    .select("categoria, objetivo_hl, real_hl, tendencia_hl, pct_avance")
    .eq("snapshot_id", s.id)
    .order("orden", { ascending: true })
  return {
    id: s.id,
    reunion_id: s.reunion_id,
    anio: s.anio,
    mes: s.mes,
    desde: s.desde ?? null,
    hasta: s.hasta ?? null,
    peso_habiles: Number(s.peso_habiles ?? 0),
    peso_trabajados: Number(s.peso_trabajados ?? 0),
    objetivo_total_hl: Number(s.objetivo_total_hl ?? 0),
    real_total_hl: Number(s.real_total_hl ?? 0),
    tendencia_total_hl: Number(s.tendencia_total_hl ?? 0),
    pct_avance_total: Number(s.pct_avance_total ?? 0),
    objetivo_disponible: s.objetivo_disponible ?? true,
    origen: (s.origen as "manual" | "auto") ?? "auto",
    updated_at: s.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detalle: ((det ?? []) as any[]).map((d) => ({
      categoria: d.categoria as CategoriaVenta,
      objetivo_hl: Number(d.objetivo_hl ?? 0),
      real_hl: Number(d.real_hl ?? 0),
      tendencia_hl: Number(d.tendencia_hl ?? 0),
      pct_avance: Number(d.pct_avance ?? 0),
    })),
  }
}

// Snapshot actual + comparación contra la reunión Ventas-Logística anterior.
export async function getAvanceVentaData(
  reunionId: string,
): Promise<Result<AvanceVentaData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const snapshot = await cargarSnapshot(supabase, reunionId)

    let comparacion: AvanceVentaComparacion | null = null
    const { data: reuActual } = await supabase
      .from("reuniones")
      .select("fecha, tipo")
      .eq("id", reunionId)
      .single()
    const reu = reuActual as { fecha: string; tipo: string } | null
    if (reu) {
      const { data: prev } = await supabase
        .from("reuniones")
        .select("id, fecha")
        .eq("tipo", reu.tipo)
        .lt("fecha", reu.fecha)
        .order("fecha", { ascending: false })
        .limit(1)
      const prevReu = (prev ?? [])[0] as { id: string; fecha: string } | undefined
      if (prevReu) {
        const prevSnap = await cargarSnapshot(supabase, prevReu.id)
        if (prevSnap) {
          comparacion = {
            anterior_fecha: prevReu.fecha,
            anterior_real_total_hl: prevSnap.real_total_hl,
            anterior_pct_avance_total: prevSnap.pct_avance_total,
            anterior_mes: prevSnap.mes,
            anterior_anio: prevSnap.anio,
          }
        }
      }
    }

    return { data: { snapshot, comparacion } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando avance de venta",
    }
  }
}

// On-demand: trae el acumulado de venta del dashboard Mercosur para el mes/año
// indicado y lo congela como snapshot. NUNCA se llama al abrir la reunión.
export async function actualizarDesdeAvanceVenta(
  reunionId: string,
  anio: number,
  mes: number,
): Promise<Result<{ real_total_hl: number; pct_avance_total: number }>> {
  try {
    const profile = await requireEditorReuniones()

    let avance
    try {
      avance = await consultarAvanceEmpresa(anio, mes)
    } catch (e) {
      return {
        error:
          e instanceof Error
            ? `No se pudo consultar el dashboard Mercosur: ${e.message}`
            : "No se pudo consultar el dashboard Mercosur.",
      }
    }

    const supabase = await createClient()
    const { data: up, error: upErr } = await supabase
      .from("reunion_avance_venta_snapshots")
      .upsert(
        {
          reunion_id: reunionId,
          anio: avance.anio,
          mes: avance.mes,
          desde: avance.desde,
          hasta: avance.hasta,
          peso_habiles: avance.peso_habiles,
          peso_trabajados: avance.peso_trabajados,
          objetivo_total_hl: avance.total.objetivo_hl,
          real_total_hl: avance.total.real_hl,
          tendencia_total_hl: avance.total.tendencia_hl,
          pct_avance_total: avance.total.pct_avance,
          objetivo_disponible: avance.objetivo_disponible,
          origen: "auto",
          creado_por: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reunion_id" },
      )
      .select("id")
      .single()
    if (upErr || !up) {
      return { error: upErr?.message ?? "No se pudo guardar el snapshot" }
    }
    const snapshotId = (up as { id: string }).id

    await supabase
      .from("reunion_avance_venta_detalle")
      .delete()
      .eq("snapshot_id", snapshotId)
    const rows = avance.categorias.map((c, i) => ({
      snapshot_id: snapshotId,
      categoria: c.categoria,
      orden: i,
      objetivo_hl: c.objetivo_hl,
      real_hl: c.real_hl,
      tendencia_hl: c.tendencia_hl,
      pct_avance: c.pct_avance,
    }))
    const { error: insErr } = await supabase
      .from("reunion_avance_venta_detalle")
      .insert(rows)
    if (insErr) return { error: insErr.message }

    return {
      data: {
        real_total_hl: avance.total.real_hl,
        pct_avance_total: avance.total.pct_avance,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando avance de venta",
    }
  }
}

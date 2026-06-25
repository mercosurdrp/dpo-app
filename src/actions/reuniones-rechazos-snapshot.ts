"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { getRechazosResumenDia as runResumen } from "@/lib/rechazos/resumen-dia"

type Result<T> = { data: T } | { error: string }

export interface RechazosSnapshotMotivo {
  id_rechazo: number
  ds_rechazo: string
  categoria: string
  hl: number
  bultos: number
  eventos: number
}

export interface RechazosSnapshot {
  id: string
  reunion_id: string
  desde: string | null
  hasta: string | null
  hl_rechazados: number
  ventas_total_hl: number
  tasa: number | null
  bultos_rechazados: number
  ventas_total_bultos: number
  tasa_bultos: number | null
  eventos: number
  patentes_con_rechazo: number
  origen: "manual" | "auto"
  updated_at: string
  motivos: RechazosSnapshotMotivo[]
}

export interface RechazosComparacion {
  anterior_fecha: string
  anterior_desde: string | null
  anterior_hasta: string | null
  anterior_tasa: number | null
  anterior_hl_rechazados: number
  anterior_bultos_rechazados: number
}

export interface RechazosSnapshotData {
  snapshot: RechazosSnapshot | null
  comparacion: RechazosComparacion | null
}

const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo editores pueden fijar la sección de rechazos")
  }
  return profile
}

type SupaClient = Awaited<ReturnType<typeof createClient>>

async function cargarSnapshot(
  supabase: SupaClient,
  reunionId: string,
): Promise<RechazosSnapshot | null> {
  const { data: snap } = await supabase
    .from("reunion_rechazos_snapshots")
    .select("*")
    .eq("reunion_id", reunionId)
    .maybeSingle()
  if (!snap) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = snap as any
  const { data: motivos } = await supabase
    .from("reunion_rechazos_motivos")
    .select("id_rechazo, ds_rechazo, categoria, hl, bultos, eventos")
    .eq("snapshot_id", s.id)
    .order("orden", { ascending: true })
  return {
    id: s.id,
    reunion_id: s.reunion_id,
    desde: s.desde ?? null,
    hasta: s.hasta ?? null,
    hl_rechazados: Number(s.hl_rechazados ?? 0),
    ventas_total_hl: Number(s.ventas_total_hl ?? 0),
    tasa: s.tasa == null ? null : Number(s.tasa),
    bultos_rechazados: Number(s.bultos_rechazados ?? 0),
    ventas_total_bultos: Number(s.ventas_total_bultos ?? 0),
    tasa_bultos: s.tasa_bultos == null ? null : Number(s.tasa_bultos),
    eventos: Number(s.eventos ?? 0),
    patentes_con_rechazo: Number(s.patentes_con_rechazo ?? 0),
    origen: (s.origen as "manual" | "auto") ?? "manual",
    updated_at: s.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    motivos: ((motivos ?? []) as any[]).map((m) => ({
      id_rechazo: Number(m.id_rechazo ?? 0),
      ds_rechazo: m.ds_rechazo ?? "",
      categoria: m.categoria ?? "",
      hl: Number(m.hl ?? 0),
      bultos: Number(m.bultos ?? 0),
      eventos: Number(m.eventos ?? 0),
    })),
  }
}

// Snapshot fijado + comparación contra la reunión Ventas-Logística anterior.
export async function getRechazosSnapshotData(
  reunionId: string,
): Promise<Result<RechazosSnapshotData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const snapshot = await cargarSnapshot(supabase, reunionId)

    let comparacion: RechazosComparacion | null = null
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
            anterior_desde: prevSnap.desde,
            anterior_hasta: prevSnap.hasta,
            anterior_tasa: prevSnap.tasa,
            anterior_hl_rechazados: prevSnap.hl_rechazados,
            anterior_bultos_rechazados: prevSnap.bultos_rechazados,
          }
        }
      }
    }

    return { data: { snapshot, comparacion } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando rechazos fijados",
    }
  }
}

// Calcula los datos del rango y los congela como snapshot de la reunión.
export async function fijarRechazosSnapshot(
  reunionId: string,
  desde: string,
  hasta: string,
): Promise<Result<RechazosSnapshot>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()

    // Mismos datos que ve la sección en vivo (KPIs + top motivos).
    const resumen = await runResumen(
      supabase,
      desde,
      desde === hasta ? undefined : hasta,
    )
    const k = resumen.kpis

    const { data: up, error: upErr } = await supabase
      .from("reunion_rechazos_snapshots")
      .upsert(
        {
          reunion_id: reunionId,
          desde,
          hasta,
          hl_rechazados: k.hl_rechazados,
          ventas_total_hl: k.ventas_total_hl,
          tasa: k.tasa,
          bultos_rechazados: k.bultos_rechazados,
          ventas_total_bultos: k.ventas_total_bultos,
          tasa_bultos: k.tasa_bultos,
          eventos: k.eventos,
          patentes_con_rechazo: k.patentes_con_rechazo,
          origen: "manual",
          creado_por: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reunion_id" },
      )
      .select("id")
      .single()
    if (upErr || !up) {
      return { error: upErr?.message ?? "No se pudo fijar el snapshot" }
    }
    const snapshotId = (up as { id: string }).id

    // Reemplazar motivos.
    await supabase
      .from("reunion_rechazos_motivos")
      .delete()
      .eq("snapshot_id", snapshotId)
    if (resumen.top_motivos.length > 0) {
      const rows = resumen.top_motivos.map((m, i) => ({
        snapshot_id: snapshotId,
        id_rechazo: m.id_rechazo,
        ds_rechazo: m.ds_rechazo,
        categoria: m.categoria,
        hl: m.hl,
        bultos: m.bultos,
        eventos: m.eventos,
        orden: i,
      }))
      const { error: insErr } = await supabase
        .from("reunion_rechazos_motivos")
        .insert(rows)
      if (insErr) return { error: insErr.message }
    }

    const saved = await cargarSnapshot(supabase, reunionId)
    if (!saved) return { error: "No se pudo releer el snapshot guardado" }
    return { data: saved }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error fijando rechazos",
    }
  }
}

// Quita la foto fijada (vuelve a modo en vivo).
export async function borrarRechazosSnapshot(
  reunionId: string,
): Promise<Result<true>> {
  try {
    await requireEditorReuniones()
    const supabase = await createClient()
    const { error } = await supabase
      .from("reunion_rechazos_snapshots")
      .delete()
      .eq("reunion_id", reunionId)
    if (error) return { error: error.message }
    return { data: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error quitando la foto",
    }
  }
}

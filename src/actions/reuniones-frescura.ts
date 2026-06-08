"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

export interface FrescuraItem {
  nro_articulo: string | null
  descripcion: string | null
  vence: string | null
  bultos: number
  valorizado: number
}

export interface FrescuraSnapshot {
  id: string
  reunion_id: string
  desde: string | null
  hasta: string | null
  total_lineas: number
  total_bultos: number
  total_valorizado: number
  accion_tomada: string | null
  origen: "manual" | "auto"
  updated_at: string
  items: FrescuraItem[]
}

export interface FrescuraComparacion {
  anterior_fecha: string
  anterior_total_lineas: number
  anterior_total_bultos: number
  anterior_total_valorizado: number
  resueltos: number // artículos que estaban antes y ya no están
  nuevos: number // artículos que no estaban antes
}

export interface FrescuraData {
  snapshot: FrescuraSnapshot | null
  comparacion: FrescuraComparacion | null
}

const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo editores pueden modificar la sección de frescura")
  }
  return profile
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}

type SupaClient = Awaited<ReturnType<typeof createClient>>

async function cargarSnapshot(
  supabase: SupaClient,
  reunionId: string,
): Promise<FrescuraSnapshot | null> {
  const { data: snap } = await supabase
    .from("reunion_frescura_snapshots")
    .select("*")
    .eq("reunion_id", reunionId)
    .maybeSingle()
  if (!snap) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = snap as any
  const { data: items } = await supabase
    .from("reunion_frescura_items")
    .select("nro_articulo, descripcion, vence, bultos, valorizado")
    .eq("snapshot_id", s.id)
    .order("vence", { ascending: true })
  return {
    id: s.id,
    reunion_id: s.reunion_id,
    desde: s.desde ?? null,
    hasta: s.hasta ?? null,
    total_lineas: s.total_lineas ?? 0,
    total_bultos: Number(s.total_bultos ?? 0),
    total_valorizado: Number(s.total_valorizado ?? 0),
    accion_tomada: s.accion_tomada ?? null,
    origen: (s.origen as "manual" | "auto") ?? "manual",
    updated_at: s.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ((items ?? []) as any[]).map((it) => ({
      nro_articulo: it.nro_articulo ?? null,
      descripcion: it.descripcion ?? null,
      vence: it.vence ?? null,
      bultos: Number(it.bultos ?? 0),
      valorizado: Number(it.valorizado ?? 0),
    })),
  }
}

// Snapshot actual + comparación contra la reunión Ventas-Logística anterior.
export async function getFrescuraData(
  reunionId: string,
): Promise<Result<FrescuraData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const snapshot = await cargarSnapshot(supabase, reunionId)

    // Reunión logistica-ventas anterior con snapshot, para comparar.
    let comparacion: FrescuraComparacion | null = null
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
          const setActual = new Set(
            (snapshot?.items ?? [])
              .map((i) => (i.nro_articulo ?? "").trim())
              .filter(Boolean),
          )
          const setPrev = new Set(
            prevSnap.items
              .map((i) => (i.nro_articulo ?? "").trim())
              .filter(Boolean),
          )
          let resueltos = 0
          for (const a of setPrev) if (!setActual.has(a)) resueltos++
          let nuevos = 0
          for (const a of setActual) if (!setPrev.has(a)) nuevos++
          comparacion = {
            anterior_fecha: prevSnap ? prevReu.fecha : prevReu.fecha,
            anterior_total_lineas: prevSnap.total_lineas,
            anterior_total_bultos: prevSnap.total_bultos,
            anterior_total_valorizado: prevSnap.total_valorizado,
            resueltos,
            nuevos,
          }
        }
      }
    }

    return { data: { snapshot, comparacion } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando frescura",
    }
  }
}

// Upsert del snapshot + reemplazo de items.
async function guardarSnapshot(
  supabase: SupaClient,
  reunionId: string,
  desde: string | null,
  hasta: string | null,
  items: FrescuraItem[],
  origen: "manual" | "auto",
  creadoPor: string,
): Promise<Result<true>> {
  const totalBultos = items.reduce((a, i) => a + num(i.bultos), 0)
  const totalValor = items.reduce((a, i) => a + num(i.valorizado), 0)

  const { data: up, error: upErr } = await supabase
    .from("reunion_frescura_snapshots")
    .upsert(
      {
        reunion_id: reunionId,
        desde,
        hasta,
        total_lineas: items.length,
        total_bultos: totalBultos,
        total_valorizado: totalValor,
        origen,
        creado_por: creadoPor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reunion_id" },
    )
    .select("id")
    .single()
  if (upErr || !up) return { error: upErr?.message ?? "No se pudo guardar el snapshot" }
  const snapshotId = (up as { id: string }).id

  // Reemplazar items.
  await supabase.from("reunion_frescura_items").delete().eq("snapshot_id", snapshotId)
  if (items.length > 0) {
    const rows = items.map((i) => ({
      snapshot_id: snapshotId,
      nro_articulo: (i.nro_articulo ?? "").toString().trim() || null,
      descripcion: (i.descripcion ?? "").toString().trim() || null,
      vence: i.vence || null,
      bultos: num(i.bultos),
      valorizado: num(i.valorizado),
    }))
    const { error: insErr } = await supabase
      .from("reunion_frescura_items")
      .insert(rows)
    if (insErr) return { error: insErr.message }
  }
  return { data: true }
}

export async function guardarFrescuraManual(
  reunionId: string,
  desde: string | null,
  hasta: string | null,
  items: FrescuraItem[],
): Promise<Result<true>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()
    return await guardarSnapshot(
      supabase,
      reunionId,
      desde,
      hasta,
      items,
      "manual",
      profile.id,
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando frescura" }
  }
}

export async function setFrescuraAccion(
  reunionId: string,
  accion: string,
): Promise<Result<true>> {
  try {
    await requireEditorReuniones()
    const supabase = await createClient()
    const { error } = await supabase
      .from("reunion_frescura_snapshots")
      .update({ accion_tomada: accion.trim() || null })
      .eq("reunion_id", reunionId)
    if (error) return { error: error.message }
    return { data: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando acción" }
  }
}

// On-demand: trae las líneas próximas a vencer del endpoint externo y las
// congela como snapshot. NUNCA se llama al abrir la reunión.
export async function actualizarDesdeFrescuraApp(
  reunionId: string,
  desde: string,
  hasta: string,
): Promise<Result<{ lineas: number }>> {
  try {
    const profile = await requireEditorReuniones()
    const base = (process.env.FRESCURA_BASE_URL ?? "").replace(/\/+$/, "")
    if (!base) {
      return {
        error:
          "Falta configurar FRESCURA_BASE_URL (la URL de la app de frescura). Cargá manual mientras tanto.",
      }
    }

    const url = `${base}/api/frescura/proximos?desde=${encodeURIComponent(
      desde,
    )}&hasta=${encodeURIComponent(hasta)}`

    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 20_000)
    let json: unknown
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "ngrok-skip-browser-warning": "true", Accept: "application/json" },
        cache: "no-store",
      })
      if (!res.ok) {
        return { error: `La app de frescura respondió ${res.status}. Probá cargar manual.` }
      }
      json = await res.json()
    } catch {
      return {
        error:
          "No se pudo conectar con la app de frescura (¿está prendida / cambió la URL?). Cargá manual.",
      }
    } finally {
      clearTimeout(timeout)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = json as any
    const arr: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : []
    const items: FrescuraItem[] = arr.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = r as any
      return {
        nro_articulo: String(o.nro_articulo ?? o.articulo ?? o.codigo ?? "").trim() || null,
        descripcion: String(o.descripcion ?? o.desc ?? "").trim() || null,
        vence: (o.vence ?? o.vencimiento ?? o.fecha_vencimiento ?? null) || null,
        bultos: num(o.bultos ?? o.cant_bultos ?? o.cantidad),
        valorizado: num(o.valorizado ?? o.valor ?? o.importe),
      }
    })

    const supabase = await createClient()
    const saved = await guardarSnapshot(
      supabase,
      reunionId,
      desde,
      hasta,
      items,
      "auto",
      profile.id,
    )
    if ("error" in saved) return saved
    return { data: { lineas: items.length } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando desde frescura",
    }
  }
}

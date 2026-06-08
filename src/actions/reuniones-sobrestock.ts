"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

type Result<T> = { data: T } | { error: string }

export interface SobrestockItem {
  nro_articulo: string | null
  descripcion: string | null
  bultos: number
  dias_cobertura: number | null
  vpd: number | null
  valorizado: number
}

export interface SobrestockSnapshot {
  id: string
  reunion_id: string
  dias_cobertura_umbral: number | null
  dias_vpd: number | null
  total_lineas: number
  total_bultos: number
  total_valorizado: number
  origen: "manual" | "auto"
  updated_at: string
  items: SobrestockItem[]
}

export interface SobrestockComparacion {
  anterior_fecha: string
  anterior_total_lineas: number
  anterior_total_bultos: number
  anterior_total_valorizado: number
  resueltos: number
  nuevos: number
}

export interface SobrestockData {
  snapshot: SobrestockSnapshot | null
  comparacion: SobrestockComparacion | null
}

const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]
const UMBRAL_COBERTURA = 30
const DIAS_VPD = 15

async function requireEditorReuniones() {
  const profile = await requireAuth()
  if (!EDITOR_ROLES.includes(profile.role)) {
    throw new Error("Solo editores pueden modificar la sección de sobrestock")
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
): Promise<SobrestockSnapshot | null> {
  const { data: snap } = await supabase
    .from("reunion_sobrestock_snapshots")
    .select("*")
    .eq("reunion_id", reunionId)
    .maybeSingle()
  if (!snap) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = snap as any
  const { data: items } = await supabase
    .from("reunion_sobrestock_items")
    .select("nro_articulo, descripcion, bultos, dias_cobertura, vpd, valorizado")
    .eq("snapshot_id", s.id)
    .order("dias_cobertura", { ascending: false })
  return {
    id: s.id,
    reunion_id: s.reunion_id,
    dias_cobertura_umbral: s.dias_cobertura_umbral ?? null,
    dias_vpd: s.dias_vpd ?? null,
    total_lineas: s.total_lineas ?? 0,
    total_bultos: Number(s.total_bultos ?? 0),
    total_valorizado: Number(s.total_valorizado ?? 0),
    origen: (s.origen as "manual" | "auto") ?? "manual",
    updated_at: s.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: ((items ?? []) as any[]).map((it) => ({
      nro_articulo: it.nro_articulo ?? null,
      descripcion: it.descripcion ?? null,
      bultos: Number(it.bultos ?? 0),
      dias_cobertura: it.dias_cobertura != null ? Number(it.dias_cobertura) : null,
      vpd: it.vpd != null ? Number(it.vpd) : null,
      valorizado: Number(it.valorizado ?? 0),
    })),
  }
}

export async function getSobrestockData(
  reunionId: string,
): Promise<Result<SobrestockData>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const snapshot = await cargarSnapshot(supabase, reunionId)

    let comparacion: SobrestockComparacion | null = null
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
            prevSnap.items.map((i) => (i.nro_articulo ?? "").trim()).filter(Boolean),
          )
          let resueltos = 0
          for (const a of setPrev) if (!setActual.has(a)) resueltos++
          let nuevos = 0
          for (const a of setActual) if (!setPrev.has(a)) nuevos++
          comparacion = {
            anterior_fecha: prevReu.fecha,
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
    return { error: err instanceof Error ? err.message : "Error cargando sobrestock" }
  }
}

async function guardarSnapshot(
  supabase: SupaClient,
  reunionId: string,
  items: SobrestockItem[],
  umbral: number | null,
  diasVpd: number | null,
  origen: "manual" | "auto",
  creadoPor: string,
): Promise<Result<true>> {
  const totalBultos = items.reduce((a, i) => a + num(i.bultos), 0)
  const totalValor = items.reduce((a, i) => a + num(i.valorizado), 0)

  const { data: up, error: upErr } = await supabase
    .from("reunion_sobrestock_snapshots")
    .upsert(
      {
        reunion_id: reunionId,
        dias_cobertura_umbral: umbral,
        dias_vpd: diasVpd,
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

  await supabase.from("reunion_sobrestock_items").delete().eq("snapshot_id", snapshotId)
  if (items.length > 0) {
    const rows = items.map((i) => ({
      snapshot_id: snapshotId,
      nro_articulo: (i.nro_articulo ?? "").toString().trim() || null,
      descripcion: (i.descripcion ?? "").toString().trim() || null,
      bultos: num(i.bultos),
      dias_cobertura: i.dias_cobertura != null ? num(i.dias_cobertura) : null,
      vpd: i.vpd != null ? num(i.vpd) : null,
      valorizado: num(i.valorizado),
    }))
    const { error: insErr } = await supabase
      .from("reunion_sobrestock_items")
      .insert(rows)
    if (insErr) return { error: insErr.message }
  }
  return { data: true }
}

export async function guardarSobrestockManual(
  reunionId: string,
  items: SobrestockItem[],
): Promise<Result<true>> {
  try {
    const profile = await requireEditorReuniones()
    const supabase = await createClient()
    return await guardarSnapshot(
      supabase,
      reunionId,
      items,
      UMBRAL_COBERTURA,
      null,
      "manual",
      profile.id,
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando sobrestock" }
  }
}

// On-demand: trae el sobrestock del endpoint externo y lo congela como snapshot.
export async function actualizarDesdeSobrestockApp(
  reunionId: string,
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

    const url = `${base}/api/frescura/sobrestock?dias_cobertura=${UMBRAL_COBERTURA}&dias_vpd=${DIAS_VPD}`
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 25_000)
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
    const items: SobrestockItem[] = arr.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = r as any
      return {
        nro_articulo: String(o.nro_articulo ?? o.articulo ?? o.codigo ?? "").trim() || null,
        descripcion: String(o.descripcion ?? o.desc ?? "").trim() || null,
        bultos: num(o.bultos ?? o.bultos_stock ?? o.cantidad),
        dias_cobertura:
          o.dias_cobertura != null ? num(o.dias_cobertura ?? o.diasPiso) : null,
        vpd: o.vpd != null ? num(o.vpd) : null,
        valorizado: num(o.valorizado ?? o.valor),
      }
    })

    const supabase = await createClient()
    const saved = await guardarSnapshot(
      supabase,
      reunionId,
      items,
      UMBRAL_COBERTURA,
      DIAS_VPD,
      "auto",
      profile.id,
    )
    if ("error" in saved) return saved
    return { data: { lineas: items.length } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando sobrestock",
    }
  }
}

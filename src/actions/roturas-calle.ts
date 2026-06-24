"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  Rotura,
  RoturaAdjunto,
  RoturaConDetalle,
  RoturaConPlan,
  RoturaInput,
  RoturaItem,
  RoturaPlan,
  RoturaPlanInput,
  UploadedRoturaFoto,
} from "@/types/roturas"

const BUCKET = "roturas-calle"
const MIS_ROTURAS_PATH = "/mis-roturas"

type Result<T> = { data: T } | { error: string }

// ===================================================
// Helpers
// ===================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adjuntoConUrl(supabase: any, a: RoturaAdjunto) {
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path)
  return { ...a, url: pub.publicUrl as string }
}

// ===================================================
// Crear (chofer)
// ===================================================

// Nota: las fotos se suben desde el cliente directo al bucket (evita el límite
// de body de Vercel en Server Actions). Acá sólo llegan los storage paths.
export async function createRotura(
  input: RoturaInput,
  fotos: UploadedRoturaFoto[] = []
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!input.fecha) return { error: "La fecha es obligatoria." }
    if (!input.patente?.trim()) return { error: "La patente es obligatoria." }
    if (input.tipo !== "rotura" && input.tipo !== "faltante") {
      return { error: "Elegí si es rotura o faltante en distribución." }
    }
    if (!input.motivo) return { error: "El motivo es obligatorio." }
    const items = (input.items ?? []).filter(
      (it) => (it.id_articulo != null || it.des_articulo?.trim()) && Number(it.cantidad) > 0
    )
    if (items.length === 0) {
      return { error: "Agregá al menos un SKU con cantidad." }
    }

    // Autollenar nombre de chofer si el empleado tiene mapeo (informativo).
    const choferNombre = await resolverChoferNombre(supabase, profile.id)

    const { data: inserted, error: errIns } = await supabase
      .from("roturas_calle")
      .insert({
        fecha: input.fecha,
        hora: input.hora || null,
        patente: input.patente.trim().toUpperCase(),
        chofer_nombre: choferNombre,
        tipo: input.tipo,
        motivo: input.motivo,
        observaciones: input.observaciones?.trim() || null,
        localidad: input.localidad?.trim() || null,
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (errIns || !inserted) {
      return { error: errIns?.message ?? "No se pudo crear la rotura." }
    }
    const roturaId = inserted.id as string

    const itemRows = items.map((it) => ({
      rotura_id: roturaId,
      id_articulo: it.id_articulo,
      des_articulo: it.des_articulo?.trim() || null,
      cantidad: Number(it.cantidad),
    }))
    const { error: errItems } = await supabase
      .from("roturas_calle_items")
      .insert(itemRows)
    if (errItems) {
      await supabase.from("roturas_calle").delete().eq("id", roturaId)
      return { error: `Error registrando los SKU: ${errItems.message}` }
    }

    if (fotos.length > 0) {
      const fotoRows = fotos.map((f) => ({
        rotura_id: roturaId,
        storage_path: f.storage_path,
        mime_type: f.mime_type,
        "tamaño_bytes": f.tamano_bytes,
        creado_por: profile.id,
      }))
      const { error: errFotos } = await supabase
        .from("roturas_calle_adjuntos")
        .insert(fotoRows)
      if (errFotos) {
        await supabase.storage.from(BUCKET).remove(fotos.map((f) => f.storage_path))
        await supabase.from("roturas_calle").delete().eq("id", roturaId)
        return { error: `Error registrando las fotos: ${errFotos.message}` }
      }
    }

    revalidatePath(MIS_ROTURAS_PATH)
    return { data: { id: roturaId } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando la rotura." }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolverChoferNombre(supabase: any, profileId: string): Promise<string | null> {
  const { data: empleado } = await supabase
    .from("empleados")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle()
  if (!empleado?.id) return null
  const { data: chofer } = await supabase
    .from("mapeo_empleado_chofer")
    .select("nombre_chofer")
    .eq("empleado_id", empleado.id)
    .limit(1)
    .maybeSingle()
  return (chofer?.nombre_chofer as string) ?? null
}

// ===================================================
// Lectura
// ===================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enriquecerRoturas(supabase: any, rows: any[]): Promise<RoturaConDetalle[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const [{ data: items }, { data: adjs }] = await Promise.all([
    supabase.from("roturas_calle_items").select("*").in("rotura_id", ids),
    supabase.from("roturas_calle_adjuntos").select("*").in("rotura_id", ids),
  ])

  const itemsByRotura = new Map<string, RoturaItem[]>()
  for (const it of (items ?? []) as RoturaItem[]) {
    const arr = itemsByRotura.get(it.rotura_id) ?? []
    arr.push(it)
    itemsByRotura.set(it.rotura_id, arr)
  }
  const adjsByRotura = new Map<string, RoturaAdjunto[]>()
  for (const a of (adjs ?? []) as RoturaAdjunto[]) {
    const arr = adjsByRotura.get(a.rotura_id) ?? []
    arr.push(a)
    adjsByRotura.set(a.rotura_id, arr)
  }

  return rows.map((row) => ({
    ...(row as Rotura),
    autor_nombre: row.autor?.nombre ?? "Desconocido",
    items: itemsByRotura.get(row.id) ?? [],
    adjuntos: (adjsByRotura.get(row.id) ?? []).map((a) => adjuntoConUrl(supabase, a)),
  }))
}

export async function getMisRoturas(): Promise<Result<RoturaConDetalle[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("roturas_calle")
      .select("*, autor:profiles!roturas_calle_creado_por_fkey(id, nombre)")
      .eq("creado_por", profile.id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    return { data: await enriquecerRoturas(supabase, (data ?? []) as unknown[] as Record<string, unknown>[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tus roturas." }
  }
}

// Para el DQI: registro de roturas del mes (sin recalcular el PPM).
export async function getRoturasChofer(
  year: number,
  month: number
): Promise<Result<RoturaConDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const desde = `${year}-${String(month).padStart(2, "0")}-01`
    const hasta = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`
    const { data, error } = await supabase
      .from("roturas_calle")
      .select("*, autor:profiles!roturas_calle_creado_por_fkey(id, nombre)")
      .gte("fecha", desde)
      .lt("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    return { data: await enriquecerRoturas(supabase, (data ?? []) as unknown[] as Record<string, unknown>[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando roturas." }
  }
}

// Para la matinal de logística: roturas de una fecha, con su plan de acción.
export async function getRoturasReunion(fecha: string): Promise<Result<RoturaConPlan[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("roturas_calle")
      .select("*, autor:profiles!roturas_calle_creado_por_fkey(id, nombre)")
      .eq("fecha", fecha)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const base = await enriquecerRoturas(supabase, (data ?? []) as unknown[] as Record<string, unknown>[])
    if (base.length === 0) return { data: [] }

    const { data: planes } = await supabase
      .from("roturas_calle_planes")
      .select("*")
      .in("rotura_id", base.map((r) => r.id))
    const planByRotura = new Map<string, RoturaPlan>()
    for (const p of (planes ?? []) as RoturaPlan[]) planByRotura.set(p.rotura_id, p)

    return { data: base.map((r) => ({ ...r, plan: planByRotura.get(r.id) ?? null })) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando roturas." }
  }
}

// ===================================================
// Plan de acción (matinal) — admin / supervisor
// ===================================================

export async function upsertRoturaPlan(
  roturaId: string,
  input: RoturaPlanInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "supervisor") {
      return { error: "Sólo admin o supervisor pueden gestionar el plan." }
    }
    if (!input.descripcion?.trim()) {
      return { error: "La descripción del plan es obligatoria." }
    }
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from("roturas_calle_planes")
      .select("id")
      .eq("rotura_id", roturaId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from("roturas_calle_planes")
        .update({
          descripcion: input.descripcion.trim(),
          responsable: input.responsable?.trim() || null,
          fecha_planificada: input.fecha_planificada || null,
        })
        .eq("id", existing.id)
      if (error) return { error: error.message }
      revalidatePath("/reuniones")
      return { data: { id: existing.id as string } }
    }

    const { data: inserted, error } = await supabase
      .from("roturas_calle_planes")
      .insert({
        rotura_id: roturaId,
        descripcion: input.descripcion.trim(),
        responsable: input.responsable?.trim() || null,
        fecha_planificada: input.fecha_planificada || null,
        creado_por: profile.id,
      })
      .select("id")
      .single()
    if (error || !inserted) {
      return { error: error?.message ?? "No se pudo crear el plan." }
    }
    revalidatePath("/reuniones")
    return { data: { id: inserted.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando el plan." }
  }
}

export async function marcarRoturaPlanCompletado(
  roturaId: string,
  completado: boolean,
  comentarioCierre?: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin" && profile.role !== "supervisor") {
      return { error: "Sólo admin o supervisor pueden completar el plan." }
    }
    const supabase = await createClient()

    const update: Record<string, unknown> = {
      fecha_completado: completado ? new Date().toISOString() : null,
    }
    if (comentarioCierre !== undefined) {
      update.comentario_cierre = comentarioCierre.trim() || null
    }

    const { error } = await supabase
      .from("roturas_calle_planes")
      .update(update)
      .eq("rotura_id", roturaId)
    if (error) return { error: error.message }

    // Reflejar el estado de la rotura.
    await supabase
      .from("roturas_calle")
      .update({ estado: completado ? "cerrada" : "en_revision" })
      .eq("id", roturaId)

    revalidatePath("/reuniones")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error actualizando el plan." }
  }
}

export async function deleteRotura(
  roturaId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Sólo el autor o un admin pueden borrar.
    const { data: rotura } = await supabase
      .from("roturas_calle")
      .select("creado_por")
      .eq("id", roturaId)
      .maybeSingle()
    if (!rotura) return { error: "Rotura no encontrada." }
    if (rotura.creado_por !== profile.id && profile.role !== "admin") {
      return { error: "No tenés permiso para borrar esta rotura." }
    }

    const { data: adjs } = await supabase
      .from("roturas_calle_adjuntos")
      .select("storage_path")
      .eq("rotura_id", roturaId)
    const paths = ((adjs ?? []) as { storage_path: string }[]).map((a) => a.storage_path)
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    const { error } = await supabase.from("roturas_calle").delete().eq("id", roturaId)
    if (error) return { error: error.message }

    revalidatePath(MIS_ROTURAS_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando la rotura." }
  }
}

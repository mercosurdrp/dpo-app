"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { SlaAdjunto, SlaConAutor, SlaEstado } from "@/types/database"

const DASHBOARD_PATH = "/sla"
const BUCKET = "sla"
const ROLES_GESTION = ["admin", "supervisor"] as const

type Result<T> = { data: T } | { error: string }

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Lista todos los SLA (con sus adjuntos y URL pública), ordenados por pilar/orden.
 * Lectura para cualquier usuario autenticado.
 */
export async function getSlas(): Promise<Result<SlaConAutor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: slas, error } = await supabase
      .from("slas")
      .select("*")
      .order("orden", { ascending: true })
    if (error) return { error: error.message }

    const { data: adjuntos, error: errAdj } = await supabase
      .from("sla_adjuntos")
      .select("*")
      .order("created_at", { ascending: false })
    if (errAdj) return { error: errAdj.message }

    const today = hoyISO()
    const adjuntosPorSla = new Map<string, SlaAdjunto[]>()
    for (const a of (adjuntos ?? []) as any[]) {
      const url = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path).data
        .publicUrl
      const item: SlaAdjunto = { ...(a as SlaAdjunto), url }
      const list = adjuntosPorSla.get(a.sla_id) ?? []
      list.push(item)
      adjuntosPorSla.set(a.sla_id, list)
    }

    const enriched: SlaConAutor[] = ((slas ?? []) as any[]).map((s) => ({
      ...(s as any),
      adjuntos: adjuntosPorSla.get(s.id) ?? [],
      vencido:
        s.estado !== "no_aplica" &&
        !!s.fecha_vencimiento &&
        s.fecha_vencimiento < today,
    }))

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los SLA",
    }
  }
}

interface UpdateSlaInput {
  estado?: SlaEstado
  fecha_firma?: string | null
  fecha_vencimiento?: string | null
  notas?: string | null
  parte_cliente?: string | null
  parte_proveedor?: string | null
  descripcion?: string | null
}

/**
 * Edita los metadatos editables de un SLA. Solo admin/supervisor.
 * No toca codigo/nombre/pilar/es_predefinido (la lista es fija).
 */
export async function updateSla(
  id: string,
  input: UpdateSlaInput,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden editar un SLA." }
    }
    const supabase = await createClient()

    const fields: Record<string, unknown> = {}
    if (input.estado !== undefined) fields.estado = input.estado
    if (input.fecha_firma !== undefined) fields.fecha_firma = input.fecha_firma
    if (input.fecha_vencimiento !== undefined)
      fields.fecha_vencimiento = input.fecha_vencimiento
    if (input.notas !== undefined) fields.notas = input.notas
    if (input.parte_cliente !== undefined)
      fields.parte_cliente = input.parte_cliente
    if (input.parte_proveedor !== undefined)
      fields.parte_proveedor = input.parte_proveedor
    if (input.descripcion !== undefined) fields.descripcion = input.descripcion

    if (Object.keys(fields).length === 0) return { data: { id } }

    const { error } = await supabase.from("slas").update(fields).eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error editando el SLA",
    }
  }
}

interface AdjuntoInput {
  storage_path: string
  nombre_original: string
  mime_type: string
  tamano_bytes: number
}

/**
 * Registra el acuerdo firmado (adjunto ya subido a Storage por el cliente).
 * Si el SLA estaba "pendiente", pasa a "firmado" y se completa la fecha de
 * firma con hoy si no tenía. Solo admin/supervisor.
 */
export async function addSlaAdjunto(
  slaId: string,
  adjunto: AdjuntoInput,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden cargar acuerdos." }
    }
    const supabase = await createClient()

    const { data: inserted, error } = await supabase
      .from("sla_adjuntos")
      .insert({
        sla_id: slaId,
        storage_path: adjunto.storage_path,
        nombre_original: adjunto.nombre_original,
        mime_type: adjunto.mime_type,
        "tamaño_bytes": adjunto.tamano_bytes,
        subido_por: profile.id,
      })
      .select("id")
      .single()

    if (error || !inserted) {
      // rollback del archivo huérfano
      await supabase.storage.from(BUCKET).remove([adjunto.storage_path])
      return { error: error?.message ?? "No se pudo registrar el acuerdo" }
    }

    // Auto-estado: si estaba pendiente, marcar firmado + fecha de firma.
    const { data: sla } = await supabase
      .from("slas")
      .select("estado, fecha_firma")
      .eq("id", slaId)
      .single()
    if (sla && (sla as any).estado === "pendiente") {
      await supabase
        .from("slas")
        .update({
          estado: "firmado",
          fecha_firma: (sla as any).fecha_firma ?? hoyISO(),
        })
        .eq("id", slaId)
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id: inserted.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el acuerdo",
    }
  }
}

/**
 * Borra un acuerdo (archivo + registro). Solo admin/supervisor.
 */
export async function deleteSlaAdjunto(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden borrar acuerdos." }
    }
    const supabase = await createClient()

    const { data: adj } = await supabase
      .from("sla_adjuntos")
      .select("storage_path")
      .eq("id", id)
      .single()

    const { error } = await supabase.from("sla_adjuntos").delete().eq("id", id)
    if (error) return { error: error.message }

    if (adj?.storage_path) {
      await supabase.storage.from(BUCKET).remove([adj.storage_path as string])
    }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando el acuerdo",
    }
  }
}

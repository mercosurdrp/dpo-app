"use server"

// El canal de denuncias es la Línea Ética EXTERNA de BDO (ver /linea-etica), así
// que acá ya no se crean denuncias: lo que queda es el histórico del canal
// propio que estuvo vigente hasta julio de 2026 y su tratamiento.

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  DenunciaLineaEtica,
  DenunciaLineaEticaDetalle,
  LineaEticaAdjunto,
  LineaEticaEstado,
} from "@/types/database"

const BUCKET = "linea-etica"
const MAX_FILE_BYTES = 10 * 1024 * 1024

type Result<T> = { data: T } | { error: string }

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

// ===================================================
// Lectura (autenticado)
// ===================================================

export async function getDenuncias(): Promise<Result<DenunciaLineaEtica[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("denuncias_linea_etica")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    return { data: (data ?? []) as DenunciaLineaEtica[] }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando denuncias",
    }
  }
}

export async function getDenuncia(
  id: string
): Promise<Result<DenunciaLineaEticaDetalle>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: den, error } = await supabase
      .from("denuncias_linea_etica")
      .select("*")
      .eq("id", id)
      .single()

    if (error || !den) {
      return { error: error?.message ?? "Denuncia no encontrada" }
    }

    const { data: adjs, error: errAdjs } = await supabase
      .from("linea_etica_adjuntos")
      .select("*")
      .eq("denuncia_id", id)
      .order("created_at", { ascending: true })

    if (errAdjs) return { error: errAdjs.message }

    const adjuntosConUrl = await Promise.all(
      ((adjs ?? []) as LineaEticaAdjunto[]).map(async (a) => {
        const { data: pub } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(a.storage_path)
        return { ...a, url: pub.publicUrl }
      })
    )

    const { data: planesLinks } = await supabase
      .from("linea_etica_plan_accion")
      .select(
        "id, plan_id, planes_accion (id, descripcion, responsable, fecha_limite, estado, progreso)"
      )
      .eq("denuncia_id", id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const planes = ((planesLinks ?? []) as any[]).map((r) => ({
      id: r.id as string,
      plan_id: r.plan_id as string,
      descripcion: r.planes_accion?.descripcion ?? "",
      responsable: r.planes_accion?.responsable ?? "",
      fecha_limite: r.planes_accion?.fecha_limite ?? null,
      estado: r.planes_accion?.estado ?? "",
      progreso: r.planes_accion?.progreso ?? 0,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = den as any
    const detalle: DenunciaLineaEticaDetalle = {
      id: row.id,
      tipo: row.tipo,
      descripcion: row.descripcion,
      lugar: row.lugar,
      area: row.area,
      localidad: row.localidad,
      fecha_hecho: row.fecha_hecho,
      identificarse: row.identificarse,
      denunciante_nombre: row.denunciante_nombre,
      denunciante_contacto: row.denunciante_contacto,
      estado: row.estado,
      resumen_tratamiento: row.resumen_tratamiento,
      cerrada_por: row.cerrada_por,
      cerrada_at: row.cerrada_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      adjuntos: adjuntosConUrl,
      planes,
    }

    return { data: detalle }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando denuncia",
    }
  }
}

// ===================================================
// Mutaciones: estado, tratamiento, adjuntos, planes
// ===================================================

export async function actualizarEstado(input: {
  id: string
  estado: LineaEticaEstado
  resumen_tratamiento?: string | null
}): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const update: Record<string, unknown> = {
      estado: input.estado,
      resumen_tratamiento: input.resumen_tratamiento ?? null,
    }
    if (input.estado === "cerrada") {
      update.cerrada_por = profile.id
      update.cerrada_at = new Date().toISOString()
    } else {
      update.cerrada_por = null
      update.cerrada_at = null
    }

    const { error } = await supabase
      .from("denuncias_linea_etica")
      .update(update)
      .eq("id", input.id)

    if (error) return { error: error.message }

    revalidatePath(`/compliance/linea-etica/${input.id}`)
    revalidatePath(`/compliance/linea-etica`)
    return { data: { id: input.id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando denuncia",
    }
  }
}

export async function subirAdjuntoTratamiento(
  formData: FormData
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const denunciaId = formData.get("denuncia_id")
    if (typeof denunciaId !== "string") {
      return { error: "denuncia_id faltante" }
    }

    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Seleccioná un archivo" }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { error: "El archivo supera los 10MB" }
    }

    const safeName = sanitizeFileName(file.name || "archivo")
    const path = `${denunciaId}/tratamiento/${crypto.randomUUID()}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()
    const mime = file.type || "application/octet-stream"

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType: mime, upsert: false })

    if (upErr) return { error: upErr.message }

    const { data: adj, error: errAdj } = await supabase
      .from("linea_etica_adjuntos")
      .insert({
        denuncia_id: denunciaId,
        origen: "tratamiento",
        storage_path: path,
        mime_type: mime,
        tamaño_bytes: file.size,
        subido_por: profile.id,
      })
      .select("id")
      .single()

    if (errAdj || !adj) {
      await supabase.storage.from(BUCKET).remove([path])
      return { error: errAdj?.message ?? "Error registrando adjunto" }
    }

    revalidatePath(`/compliance/linea-etica/${denunciaId}`)
    return { data: { id: adj.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error subiendo adjunto",
    }
  }
}

export async function eliminarAdjunto(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede eliminar adjuntos" }
    }
    const supabase = await createClient()

    const { data: adj } = await supabase
      .from("linea_etica_adjuntos")
      .select("storage_path, denuncia_id")
      .eq("id", id)
      .single()

    if (adj?.storage_path) {
      await supabase.storage.from(BUCKET).remove([adj.storage_path])
    }

    const { error } = await supabase
      .from("linea_etica_adjuntos")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    if (adj?.denuncia_id) {
      revalidatePath(`/compliance/linea-etica/${adj.denuncia_id}`)
    }
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando adjunto",
    }
  }
}

export async function crearPlanAccionDenuncia(input: {
  denuncia_id: string
  descripcion: string
  responsable: string
  fecha_limite?: string | null
  prioridad?: "baja" | "media" | "alta" | "critica"
}): Promise<Result<{ plan_id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Buscar la pregunta 1.1 (Compliance) para anclar el plan
    const { data: pregunta } = await supabase
      .from("preguntas")
      .select("id")
      .eq("numero", "1.1")
      .limit(1)
      .single()

    if (!pregunta) {
      return { error: "No se encontró la pregunta 1.1 (Compliance)" }
    }

    const { data: plan, error: errPlan } = await supabase
      .from("planes_accion")
      .insert({
        pregunta_id: pregunta.id,
        descripcion: input.descripcion.trim(),
        responsable: input.responsable.trim(),
        fecha_limite: input.fecha_limite || null,
        estado: "pendiente",
        prioridad: input.prioridad ?? "alta",
        progreso: 0,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (errPlan || !plan) {
      return { error: errPlan?.message ?? "No se pudo crear el plan" }
    }

    const { error: errLink } = await supabase
      .from("linea_etica_plan_accion")
      .insert({
        denuncia_id: input.denuncia_id,
        plan_id: plan.id,
        created_by: profile.id,
      })

    if (errLink) {
      return { error: errLink.message }
    }

    revalidatePath(`/compliance/linea-etica/${input.denuncia_id}`)
    return { data: { plan_id: plan.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando plan de acción",
    }
  }
}

export async function eliminarDenuncia(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (profile.role !== "admin") {
      return { error: "Sólo un admin puede eliminar denuncias" }
    }
    const supabase = await createClient()

    const { data: adjs } = await supabase
      .from("linea_etica_adjuntos")
      .select("storage_path")
      .eq("denuncia_id", id)

    const paths = ((adjs ?? []) as { storage_path: string }[]).map(
      (a) => a.storage_path
    )
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    const { error } = await supabase
      .from("denuncias_linea_etica")
      .delete()
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/compliance/linea-etica")
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando denuncia",
    }
  }
}

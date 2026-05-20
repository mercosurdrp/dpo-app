"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { EstadoPlan } from "@/types/database"

const BUCKET = "planes-avances"

type Result<T> = { data: T } | { error: string }

export interface PlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: EstadoPlan | null
  autor_id: string | null
  created_at: string
}

export interface PlanAvanceConAutor extends PlanAvance {
  autor_nombre: string | null
}

const ESTADOS_VALIDOS: EstadoPlan[] = ["pendiente", "en_progreso", "completado"]

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

function cleanFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80)
}

async function puedeIntervenirEnPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  profileRole: string,
  planId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isEditorRole(profileRole)) return { ok: true }

  const { data: plan, error: planErr } = await supabase
    .from("planes_accion")
    .select("created_by")
    .eq("id", planId)
    .single()
  if (planErr || !plan) {
    return { ok: false, error: planErr?.message ?? "Plan no encontrado" }
  }
  if ((plan as { created_by: string | null }).created_by === profileId) {
    return { ok: true }
  }

  const { data: resp } = await supabase
    .from("plan_responsables")
    .select("id")
    .eq("plan_id", planId)
    .eq("profile_id", profileId)
    .maybeSingle()
  if (resp) return { ok: true }

  return {
    ok: false,
    error: "Solo responsables del plan o editores pueden cargar avances",
  }
}

export async function listarAvancesPlan(
  planId: string,
): Promise<Result<PlanAvanceConAutor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("planes_accion_avances")
      .select(
        "*, autor:profiles!planes_accion_avances_autor_id_fkey(id, nombre)",
      )
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }

    const avances: PlanAvanceConAutor[] = (
      (data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante:
          (r.estado_resultante as EstadoPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        created_at: r.created_at,
        autor_nombre: r.autor?.nombre ?? null,
      }
    })

    return { data: avances }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando los avances",
    }
  }
}

export async function agregarAvancePlan(
  planId: string,
  formData: FormData,
): Promise<Result<PlanAvance>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!planId) return { error: "ID de plan inválido" }

    const permiso = await puedeIntervenirEnPlan(
      supabase,
      profile.id,
      profile.role,
      planId,
    )
    if (!permiso.ok) return { error: permiso.error }

    const { data: planActual, error: errActual } = await supabase
      .from("planes_accion")
      .select("estado")
      .eq("id", planId)
      .single()
    if (errActual || !planActual) {
      return { error: errActual?.message ?? "Plan no encontrado" }
    }
    const estadoAnterior = (planActual as { estado: EstadoPlan }).estado

    const comentarioRaw = String(formData.get("comentario") ?? "").trim()
    const comentario = comentarioRaw || null
    const file = formData.get("archivo") as File | null
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    const tieneArchivo = file && file instanceof File && file.size > 0

    let nuevoEstado: EstadoPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoPlan)) {
        return { error: "Estado inválido" }
      }
      nuevoEstado = nuevoEstadoRaw as EstadoPlan
    }

    if (nuevoEstado === "completado" && !comentario) {
      return {
        error: "Para cerrar el plan tenés que escribir un comentario",
      }
    }
    if (!tieneArchivo && !comentario) {
      return { error: "Adjuntá un archivo o escribí un comentario" }
    }

    let archivoPath: string | null = null
    let archivoNombre: string | null = null

    if (tieneArchivo) {
      const cleanName = cleanFileName(file.name)
      const path = `${planId}/v${Date.now()}-${cleanName}`
      const arrayBuffer = await file.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upErr) return { error: `Subiendo archivo: ${upErr.message}` }
      archivoPath = path
      archivoNombre = file.name
    }

    const { data: avance, error: errAv } = await supabase
      .from("planes_accion_avances")
      .insert({
        plan_id: planId,
        comentario,
        archivo_path: archivoPath,
        archivo_nombre: archivoNombre,
        archivo_mime: tieneArchivo ? file.type || null : null,
        archivo_bytes: tieneArchivo ? file.size : null,
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select("*")
      .single()

    if (errAv || !avance) {
      if (archivoPath) {
        await supabase.storage.from(BUCKET).remove([archivoPath])
      }
      return {
        error: errAv?.message ?? "No se pudo registrar el avance",
      }
    }

    if (nuevoEstado && nuevoEstado !== estadoAnterior) {
      const { error: errUpd } = await supabase
        .from("planes_accion")
        .update({ estado: nuevoEstado })
        .eq("id", planId)
      if (errUpd) {
        await supabase
          .from("planes_accion_avances")
          .delete()
          .eq("id", (avance as { id: string }).id)
        if (archivoPath) {
          await supabase.storage.from(BUCKET).remove([archivoPath])
        }
        return { error: errUpd.message }
      }

      await supabase.from("plan_historial").insert({
        plan_id: planId,
        estado_anterior: estadoAnterior,
        estado_nuevo: nuevoEstado,
        changed_by: profile.id,
      })
    }

    revalidatePath(`/planes/${planId}`)

    return { data: avance as PlanAvance }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando el avance",
    }
  }
}

export async function getAvancePlanSignedUrl(
  archivoPath: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    if (!archivoPath) return { error: "Ruta de archivo inválida" }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(archivoPath, 60 * 10)
    if (error || !data) {
      return { error: error?.message ?? "No se pudo generar URL" }
    }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error generando URL",
    }
  }
}

export async function eliminarAvancePlan(
  avanceId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!avanceId) return { error: "ID de avance inválido" }

    const { data: avance, error: errA } = await supabase
      .from("planes_accion_avances")
      .select("id, plan_id, autor_id, archivo_path")
      .eq("id", avanceId)
      .single()
    if (errA || !avance) {
      return { error: errA?.message ?? "Avance no encontrado" }
    }

    const row = avance as {
      id: string
      plan_id: string
      autor_id: string | null
      archivo_path: string | null
    }

    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const { error: errDel } = await supabase
      .from("planes_accion_avances")
      .delete()
      .eq("id", avanceId)
    if (errDel) return { error: errDel.message }

    if (row.archivo_path) {
      await supabase.storage.from(BUCKET).remove([row.archivo_path])
    }

    revalidatePath(`/planes/${row.plan_id}`)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el avance",
    }
  }
}

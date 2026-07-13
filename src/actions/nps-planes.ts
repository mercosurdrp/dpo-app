"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  archivosDeFila,
  archivosDelForm,
  columnasArchivos,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"

const BUCKET = "nps-planes"
const NPS_PATH = "/nps"

export type EstadoNpsPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadNpsPlan = "alta" | "media" | "baja"

const ESTADOS_VALIDOS: EstadoNpsPlan[] = [
  "pendiente",
  "en_progreso",
  "completado",
]
const PRIORIDADES_VALIDAS: PrioridadNpsPlan[] = ["alta", "media", "baja"]

type Result<T> = { data: T } | { error: string }

export type RecuperacionPlan =
  | "recuperado" // re-encuestado y pasó a promotor (9-10)
  | "mejorando" // re-encuestado, subió el score pero no llegó a promotor
  | "critico" // re-encuestado y sigue igual o peor
  | "sin_reencuesta" // todavía no lo volvieron a encuestar

export interface NpsPlan {
  id: string
  titulo: string
  descripcion: string | null
  foco_driver: string | null
  foco_cliente_id: number | null
  foco_cliente_nombre: string | null
  foco_promotor: string | null
  prioridad: PrioridadNpsPlan
  estado: EstadoNpsPlan
  responsable_id: string | null
  responsable_nombre: string | null
  fecha_objetivo: string | null
  created_by: string | null
  created_by_nombre: string | null
  created_at: string
  updated_at: string
  avances_count: number
  // --- seguimiento de recuperación (solo planes con cliente foco) ---
  baseline_score: number | null
  baseline_categoria: string | null
  baseline_fecha: string | null
  recuperacion: RecuperacionPlan | null
  re_score: number | null
  re_categoria: string | null
  re_fecha: string | null
  /** RMD del cliente desde que existe el plan (señal temprana). */
  rmd_post_n: number
  rmd_post_avg: number | null
}

export interface NpsPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  /** Todos los adjuntos del avance. Los avances viejos traen acá su único archivo. */
  archivos: ArchivoAvance[]
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: EstadoNpsPlan | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

// ------------------------------------------------------------------
// Listado de planes (con autor, responsable y conteo de avances)
// ------------------------------------------------------------------
export async function listarPlanesNps(): Promise<Result<NpsPlan[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("nps_planes")
      .select(
        "*, responsable:profiles!nps_planes_responsable_id_fkey(id, nombre), autor:profiles!nps_planes_created_by_fkey(id, nombre)",
      )
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    const ids = rows.map((r) => r.id as string)

    const countMap = new Map<string, number>()
    if (ids.length) {
      const { data: avs } = await supabase
        .from("nps_planes_avances")
        .select("plan_id")
        .in("plan_id", ids)
      for (const a of (avs ?? []) as Array<{ plan_id: string }>) {
        countMap.set(a.plan_id, (countMap.get(a.plan_id) ?? 0) + 1)
      }
    }

    // Seguimiento de recuperación: encuestas y RMD posteriores al plan,
    // para todos los clientes foco en dos consultas.
    const clienteIds = [
      ...new Set(
        rows
          .map((r) => r.foco_cliente_id as number | null)
          .filter((x): x is number => x != null),
      ),
    ]
    const encPorCliente = new Map<
      number,
      Array<{ fecha_enc: string; score: number; categoria: string }>
    >()
    const rmdPorCliente = new Map<
      number,
      Array<{ fecha_puntuacion: string; puntuacion: number }>
    >()
    if (clienteIds.length) {
      const [encRes, rmdRes] = await Promise.all([
        supabase
          .from("nps_encuestas")
          .select("cod_cliente, fecha_enc, score, categoria")
          .in("cod_cliente", clienteIds)
          .order("fecha_enc", { ascending: true }),
        supabase
          .from("nps_rmd_cliente")
          .select("cod_cliente, fecha_puntuacion, puntuacion")
          .in("cod_cliente", clienteIds)
          .order("fecha_puntuacion", { ascending: true }),
      ])
      for (const e of (encRes.data ?? []) as Array<{
        cod_cliente: number
        fecha_enc: string
        score: number
        categoria: string
      }>) {
        const arr = encPorCliente.get(e.cod_cliente) ?? []
        arr.push(e)
        encPorCliente.set(e.cod_cliente, arr)
      }
      for (const r of (rmdRes.data ?? []) as Array<{
        cod_cliente: number
        fecha_puntuacion: string
        puntuacion: number
      }>) {
        const arr = rmdPorCliente.get(r.cod_cliente) ?? []
        arr.push(r)
        rmdPorCliente.set(r.cod_cliente, arr)
      }
    }

    const planes: NpsPlan[] = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any

      // Recuperación del cliente foco.
      let recuperacion: RecuperacionPlan | null = null
      let re_score: number | null = null
      let re_categoria: string | null = null
      let re_fecha: string | null = null
      let rmd_post_n = 0
      let rmd_post_avg: number | null = null
      if (r.foco_cliente_id != null) {
        const encs = encPorCliente.get(r.foco_cliente_id) ?? []
        const posteriores = encs.filter((e) => e.fecha_enc > r.created_at)
        if (posteriores.length === 0) {
          recuperacion = "sin_reencuesta"
        } else {
          const u = posteriores[posteriores.length - 1]
          re_score = u.score
          re_categoria = u.categoria
          re_fecha = u.fecha_enc
          const base = (r.baseline_score as number | null) ?? null
          if (u.score >= 9) recuperacion = "recuperado"
          else if (base != null && u.score > base) recuperacion = "mejorando"
          else recuperacion = "critico"
        }
        const fechaPlan = String(r.created_at).slice(0, 10)
        const rmds = (rmdPorCliente.get(r.foco_cliente_id) ?? []).filter(
          (x) => x.fecha_puntuacion >= fechaPlan,
        )
        rmd_post_n = rmds.length
        if (rmds.length) {
          rmd_post_avg =
            Math.round(
              (rmds.reduce((s, x) => s + x.puntuacion, 0) / rmds.length) * 100,
            ) / 100
        }
      }

      return {
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion ?? null,
        foco_driver: r.foco_driver ?? null,
        foco_cliente_id: r.foco_cliente_id ?? null,
        foco_cliente_nombre: r.foco_cliente_nombre ?? null,
        foco_promotor: r.foco_promotor ?? null,
        prioridad: (r.prioridad as PrioridadNpsPlan) ?? "media",
        estado: (r.estado as EstadoNpsPlan) ?? "pendiente",
        responsable_id: r.responsable_id ?? null,
        responsable_nombre: r.responsable?.nombre ?? null,
        fecha_objetivo: r.fecha_objetivo ?? null,
        created_by: r.created_by ?? null,
        created_by_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        avances_count: countMap.get(r.id) ?? 0,
        baseline_score: r.baseline_score ?? null,
        baseline_categoria: r.baseline_categoria ?? null,
        baseline_fecha: r.baseline_fecha ?? null,
        recuperacion,
        re_score,
        re_categoria,
        re_fecha,
        rmd_post_n,
        rmd_post_avg,
      }
    })

    return { data: planes }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los planes",
    }
  }
}

// ------------------------------------------------------------------
// Crear plan
// ------------------------------------------------------------------
export async function crearPlanNps(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!isEditorRole(profile.role)) {
      return { error: "Solo editores pueden crear planes de acción" }
    }
    const supabase = await createClient()

    const titulo = String(formData.get("titulo") ?? "").trim()
    if (!titulo) return { error: "El título es obligatorio" }

    const descripcion = String(formData.get("descripcion") ?? "").trim() || null
    const prioridadRaw = String(formData.get("prioridad") ?? "media").trim()
    const prioridad = PRIORIDADES_VALIDAS.includes(
      prioridadRaw as PrioridadNpsPlan,
    )
      ? (prioridadRaw as PrioridadNpsPlan)
      : "media"

    const focoDriver = String(formData.get("foco_driver") ?? "").trim() || null
    const focoClienteId = parseIntOrNull(formData.get("foco_cliente_id"))
    const focoClienteNombre =
      String(formData.get("foco_cliente_nombre") ?? "").trim() || null
    const focoPromotor =
      String(formData.get("foco_promotor") ?? "").trim() || null
    const responsableId =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fechaObjetivo =
      String(formData.get("fecha_objetivo") ?? "").trim() || null

    // Baseline: la última encuesta del cliente foco al momento de crear el
    // plan, para después medir la recuperación contra la re-encuesta.
    let baseline: {
      baseline_score?: number
      baseline_categoria?: string
      baseline_fecha?: string
    } = {}
    if (focoClienteId != null) {
      const { data: enc } = await supabase
        .from("nps_encuestas")
        .select("score, categoria, fecha_enc")
        .eq("cod_cliente", focoClienteId)
        .order("fecha_enc", { ascending: false })
        .limit(1)
      const e = (enc ?? [])[0] as
        | { score: number; categoria: string; fecha_enc: string }
        | undefined
      if (e) {
        baseline = {
          baseline_score: e.score,
          baseline_categoria: e.categoria,
          baseline_fecha: e.fecha_enc,
        }
      }
    }

    const { data, error } = await supabase
      .from("nps_planes")
      .insert({
        titulo,
        descripcion,
        prioridad,
        estado: "pendiente",
        foco_driver: focoDriver,
        foco_cliente_id: focoClienteId,
        foco_cliente_nombre: focoClienteNombre,
        foco_promotor: focoPromotor,
        responsable_id: responsableId,
        fecha_objetivo: fechaObjetivo,
        created_by: profile.id,
        ...baseline,
      })
      .select("id")
      .single()

    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear el plan" }
    }

    revalidatePath(NPS_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Actualizar plan (campos editables)
// ------------------------------------------------------------------
export async function actualizarPlanNps(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("nps_planes")
      .select("created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const p = plan as { created_by: string | null; responsable_id: string | null }
    if (
      !isEditorRole(profile.role) &&
      p.created_by !== profile.id &&
      p.responsable_id !== profile.id
    ) {
      return { error: "No tenés permiso para editar este plan" }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (formData.has("titulo")) {
      const t = String(formData.get("titulo") ?? "").trim()
      if (!t) return { error: "El título no puede quedar vacío" }
      updates.titulo = t
    }
    if (formData.has("descripcion"))
      updates.descripcion = String(formData.get("descripcion") ?? "").trim() || null
    if (formData.has("prioridad")) {
      const pr = String(formData.get("prioridad") ?? "").trim()
      if (PRIORIDADES_VALIDAS.includes(pr as PrioridadNpsPlan))
        updates.prioridad = pr
    }
    if (formData.has("estado")) {
      const es = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS_VALIDOS.includes(es as EstadoNpsPlan))
        return { error: "Estado inválido" }
      updates.estado = es
    }
    if (formData.has("foco_driver"))
      updates.foco_driver =
        String(formData.get("foco_driver") ?? "").trim() || null
    if (formData.has("foco_cliente_id"))
      updates.foco_cliente_id = parseIntOrNull(formData.get("foco_cliente_id"))
    if (formData.has("foco_cliente_nombre"))
      updates.foco_cliente_nombre =
        String(formData.get("foco_cliente_nombre") ?? "").trim() || null
    if (formData.has("foco_promotor"))
      updates.foco_promotor =
        String(formData.get("foco_promotor") ?? "").trim() || null
    if (formData.has("responsable_id"))
      updates.responsable_id =
        String(formData.get("responsable_id") ?? "").trim() || null
    if (formData.has("fecha_objetivo"))
      updates.fecha_objetivo =
        String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { error } = await supabase
      .from("nps_planes")
      .update(updates)
      .eq("id", planId)
    if (error) return { error: error.message }

    revalidatePath(NPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Eliminar plan (cascade borra avances; limpiamos archivos del bucket)
// ------------------------------------------------------------------
export async function eliminarPlanNps(
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("nps_planes")
      .select("created_by")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    if (
      !isEditorRole(profile.role) &&
      (plan as { created_by: string | null }).created_by !== profile.id
    ) {
      return { error: "No tenés permiso para eliminar este plan" }
    }

    // Un avance puede tener varios archivos: juntamos los de la columna jsonb
    // `archivos` y los de las columnas singulares (avances viejos).
    const { data: avs } = await supabase
      .from("nps_planes_avances")
      .select("archivos, archivo_path, archivo_nombre, archivo_mime, archivo_bytes")
      .eq("plan_id", planId)
    const paths = [
      ...new Set(
        (
          (avs ?? []) as Array<{
            archivos: unknown
            archivo_path: string | null
            archivo_nombre: string | null
            archivo_mime: string | null
            archivo_bytes: number | null
          }>
        ).flatMap((a) => archivosDeFila(a).map((x) => x.path)),
      ),
    ]

    const { error } = await supabase
      .from("nps_planes")
      .delete()
      .eq("id", planId)
    if (error) return { error: error.message }

    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(NPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el plan",
    }
  }
}

// ------------------------------------------------------------------
// Avances (seguimiento + evidencia)
// ------------------------------------------------------------------
export async function listarAvancesPlanNps(
  planId: string,
): Promise<Result<NpsPlanAvance[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("nps_planes_avances")
      .select(
        "*, autor:profiles!nps_planes_avances_autor_id_fkey(id, nombre)",
      )
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const avances: NpsPlanAvance[] = (
      (data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivos: archivosDeFila(r),
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante: (r.estado_resultante as EstadoNpsPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      }
    })
    return { data: avances }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los avances",
    }
  }
}

export async function agregarAvancePlanNps(
  planId: string,
  formData: FormData,
): Promise<Result<NpsPlanAvance>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("nps_planes")
      .select("estado, created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const planRow = plan as {
      estado: EstadoNpsPlan
      created_by: string | null
      responsable_id: string | null
    }
    if (
      !isEditorRole(profile.role) &&
      planRow.created_by !== profile.id &&
      planRow.responsable_id !== profile.id
    ) {
      return { error: "Solo el responsable o un editor puede cargar avances" }
    }

    const comentario = String(formData.get("comentario") ?? "").trim() || null
    const files = archivosDelForm(formData)
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    const tieneArchivo = files.length > 0

    let nuevoEstado: EstadoNpsPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoNpsPlan))
        return { error: "Estado inválido" }
      nuevoEstado = nuevoEstadoRaw as EstadoNpsPlan
    }

    if (!tieneArchivo && !comentario) {
      return { error: "Cargá un comentario o adjuntá un archivo de evidencia" }
    }

    let archivos: ArchivoAvance[] = []
    if (tieneArchivo) {
      const subida = await subirArchivosAvance(supabase, BUCKET, planId, files)
      if ("error" in subida) return { error: subida.error }
      archivos = subida.archivos
    }
    const paths = archivos.map((a) => a.path)

    const { data: avance, error: errAv } = await supabase
      .from("nps_planes_avances")
      .insert({
        plan_id: planId,
        comentario,
        ...columnasArchivos(archivos),
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select(
        "*, autor:profiles!nps_planes_avances_autor_id_fkey(id, nombre)",
      )
      .single()

    if (errAv || !avance) {
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      return { error: errAv?.message ?? "No se pudo registrar el avance" }
    }

    if (nuevoEstado && nuevoEstado !== planRow.estado) {
      const { error: errUpd } = await supabase
        .from("nps_planes")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", planId)
      if (errUpd) {
        await supabase
          .from("nps_planes_avances")
          .delete()
          .eq("id", (avance as { id: string }).id)
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
        return { error: errUpd.message }
      }
    }

    revalidatePath(NPS_PATH)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = avance as any
    return {
      data: {
        id: r.id,
        plan_id: r.plan_id,
        comentario: r.comentario ?? null,
        archivos: archivosDeFila(r),
        archivo_path: r.archivo_path ?? null,
        archivo_nombre: r.archivo_nombre ?? null,
        archivo_mime: r.archivo_mime ?? null,
        archivo_bytes: r.archivo_bytes ?? null,
        estado_resultante: (r.estado_resultante as EstadoNpsPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      },
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error registrando el avance",
    }
  }
}

export async function eliminarAvancePlanNps(
  avanceId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!avanceId) return { error: "ID de avance inválido" }

    const { data: avance, error: errA } = await supabase
      .from("nps_planes_avances")
      .select(
        "id, autor_id, archivos, archivo_path, archivo_nombre, archivo_mime, archivo_bytes",
      )
      .eq("id", avanceId)
      .single()
    if (errA || !avance) return { error: errA?.message ?? "Avance no encontrado" }
    const row = avance as {
      autor_id: string | null
      archivos: unknown
      archivo_path: string | null
      archivo_nombre: string | null
      archivo_mime: string | null
      archivo_bytes: number | null
    }
    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const { error: errDel } = await supabase
      .from("nps_planes_avances")
      .delete()
      .eq("id", avanceId)
    if (errDel) return { error: errDel.message }

    const paths = archivosDeFila(row).map((a) => a.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(NPS_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el avance",
    }
  }
}

export async function getAvanceNpsSignedUrl(
  archivoPath: string,
): Promise<Result<{ url: string }>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!archivoPath) return { error: "Ruta de archivo inválida" }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(archivoPath, 60 * 10)
    if (error || !data) return { error: error?.message ?? "No se pudo generar URL" }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error generando URL",
    }
  }
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

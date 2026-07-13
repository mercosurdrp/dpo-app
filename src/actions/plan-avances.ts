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
import type { EstadoPlan } from "@/types/database"

const BUCKET = "planes-avances"

type Result<T> = { data: T } | { error: string }

export interface PlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  /** Todos los adjuntos del avance. Los avances viejos traen acá su único archivo. */
  archivos: ArchivoAvance[]
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
        archivos: archivosDeFila(r),
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

export interface ArchivoRespuesta {
  id: string
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  url: string
  autor_nombre: string | null
  created_at: string
  fuente: "respuesta" | "manual"
  plan_id: string | null
  plan_titulo: string
}

/**
 * Historial de archivos de un punto del manual: archivos subidos en las
 * respuestas (avances) de las tareas de esa pregunta + evidencias cargadas
 * manualmente para el punto (tabla `evidencias`). Read-only.
 */
export async function listarArchivosDeRespuestas(
  preguntaId: string,
): Promise<Result<ArchivoRespuesta[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!preguntaId) return { error: "ID de pregunta inválido" }

    // 1) planes de la pregunta (para el nombre de la tarea)
    const { data: planes } = await supabase
      .from("planes_accion")
      .select("id, titulo, descripcion")
      .eq("pregunta_id", preguntaId)
    const planList = (planes ?? []) as Array<{
      id: string
      titulo: string | null
      descripcion: string
    }>
    const planMap = new Map(
      planList.map((p) => [p.id, p.titulo || p.descripcion]),
    )
    const planIds = planList.map((p) => p.id)

    // 2) avances con archivo de esas tareas
    const avList = planIds.length
      ? (((
          await supabase
            .from("planes_accion_avances")
            .select(
              "id, plan_id, archivos, archivo_path, archivo_nombre, archivo_mime, archivo_bytes, autor_id, created_at",
            )
            .in("plan_id", planIds)
            .not("archivo_path", "is", null)
            .order("created_at", { ascending: false })
        ).data ?? []) as Array<{
          id: string
          plan_id: string
          archivos: unknown
          archivo_path: string
          archivo_nombre: string | null
          archivo_mime: string | null
          archivo_bytes: number | null
          autor_id: string | null
          created_at: string
        }>)
      : []

    // Un avance puede traer varios archivos: cada uno es un ítem del historial.
    const avArchivos = avList.flatMap((a) =>
      archivosDeFila(a).map((arch, i) => ({ avance: a, arch, i })),
    )

    // 3) evidencias cargadas manualmente para el punto (legacy, no se borran)
    const { data: evRows } = await supabase
      .from("evidencias")
      .select("id, titulo, url, file_path, tipo, created_by, created_at")
      .eq("pregunta_id", preguntaId)
      .order("created_at", { ascending: false })
    const evList = (evRows ?? []) as Array<{
      id: string
      titulo: string
      url: string | null
      file_path: string | null
      tipo: string
      created_by: string | null
      created_at: string
    }>

    if (avList.length === 0 && evList.length === 0) return { data: [] }

    // 4) autores de ambos orígenes
    const autorIds = Array.from(
      new Set(
        [
          ...avList.map((a) => a.autor_id),
          ...evList.map((e) => e.created_by),
        ].filter(Boolean),
      ),
    ) as string[]
    const { data: profiles } = autorIds.length
      ? await supabase.from("profiles").select("id, nombre").in("id", autorIds)
      : { data: [] as Array<{ id: string; nombre: string }> }
    const autorMap = new Map(
      ((profiles ?? []) as Array<{ id: string; nombre: string }>).map((p) => [
        p.id,
        p.nombre,
      ]),
    )

    // 5) firmar URLs de los avances (bucket privado)
    const urlMap = new Map<string, string>()
    if (avArchivos.length) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          avArchivos.map(({ arch }) => arch.path),
          60 * 30,
        )
      for (const s of (signed ?? []) as Array<{
        path: string | null
        signedUrl: string
      }>) {
        if (s.path) urlMap.set(s.path, s.signedUrl)
      }
    }

    const itemsAvances: ArchivoRespuesta[] = avArchivos.map(
      ({ avance: a, arch, i }) => ({
        id: `av-${a.id}-${i}`,
        archivo_nombre: arch.nombre,
        archivo_mime: arch.mime,
        archivo_bytes: arch.bytes,
        url: urlMap.get(arch.path) ?? "",
        autor_nombre: a.autor_id ? autorMap.get(a.autor_id) ?? "Usuario" : null,
        created_at: a.created_at,
        fuente: "respuesta",
        plan_id: a.plan_id,
        plan_titulo: planMap.get(a.plan_id) ?? "",
      }),
    )

    const itemsManual: ArchivoRespuesta[] = evList.map((e) => {
      let url = e.url ?? ""
      if (!url && e.file_path) {
        url = supabase.storage.from("evidencias").getPublicUrl(e.file_path).data
          .publicUrl
      }
      return {
        id: `ev-${e.id}`,
        archivo_nombre: e.titulo,
        archivo_mime: e.tipo === "foto" ? "image/*" : null,
        archivo_bytes: null,
        url,
        autor_nombre: e.created_by
          ? autorMap.get(e.created_by) ?? "Usuario"
          : null,
        created_at: e.created_at,
        fuente: "manual",
        plan_id: null,
        plan_titulo: "Evidencia cargada manualmente",
      }
    })

    const items = [...itemsAvances, ...itemsManual].sort(
      (x, y) =>
        new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
    )
    return { data: items }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error listando archivos",
    }
  }
}

// Clona una tarea como "seguimiento" de la original (al reprogramar al cerrar).
// Hereda título/descr/tipo/punto/prioridad/evidencia + responsables, nace
// pendiente con la nueva fecha y queda enlazada por origen_plan_id.
async function crearSeguimiento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  origen: {
    titulo: string | null
    descripcion: string
    tipo: string
    pregunta_id: string | null
    prioridad: string
    evidencia_obligatoria: boolean
  },
  planId: string,
  fechaLimite: string,
  profileId: string,
): Promise<{ id: string } | { error: string }> {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: nuevo, error } = await supabase
    .from("planes_accion")
    .insert({
      pregunta_id: origen.pregunta_id,
      tipo: origen.tipo,
      titulo: origen.titulo,
      descripcion: origen.descripcion,
      responsable: "",
      fecha_inicio: hoy,
      fecha_limite: fechaLimite,
      estado: "pendiente",
      prioridad: origen.prioridad,
      evidencia_obligatoria: origen.evidencia_obligatoria,
      origen_plan_id: planId,
      created_by: profileId,
    })
    .select("id")
    .single()
  if (error || !nuevo) {
    return { error: error?.message ?? "No se pudo crear el seguimiento" }
  }
  const segId = (nuevo as { id: string }).id

  const { data: resps } = await supabase
    .from("plan_responsables")
    .select("profile_id, rol")
    .eq("plan_id", planId)
  const filas = (
    (resps ?? []) as Array<{ profile_id: string; rol: string }>
  ).map((r) => ({
    plan_id: segId,
    profile_id: r.profile_id,
    rol: r.rol,
    asignado_por: profileId,
  }))
  if (filas.length > 0) {
    await supabase.from("plan_responsables").insert(filas)
  }
  return { id: segId }
}

export async function agregarAvancePlan(
  planId: string,
  formData: FormData,
): Promise<{ data: PlanAvance; seguimientoId?: string } | { error: string }> {
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
      .select(
        "estado, titulo, descripcion, tipo, pregunta_id, prioridad, evidencia_obligatoria",
      )
      .eq("id", planId)
      .single()
    if (errActual || !planActual) {
      return { error: errActual?.message ?? "Plan no encontrado" }
    }
    const planOrigen = planActual as {
      estado: EstadoPlan
      titulo: string | null
      descripcion: string
      tipo: string
      pregunta_id: string | null
      prioridad: string
      evidencia_obligatoria: boolean
    }
    const estadoAnterior = planOrigen.estado

    const comentarioRaw = String(formData.get("comentario") ?? "").trim()
    const comentario = comentarioRaw || null
    const files = archivosDelForm(formData)
    const nuevoEstadoRaw = String(formData.get("nuevo_estado") ?? "").trim()
    const seguimientoFecha =
      String(formData.get("seguimiento_fecha") ?? "").trim() || null
    const tieneArchivo = files.length > 0

    let nuevoEstado: EstadoPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoPlan)) {
        return { error: "Estado inválido" }
      }
      nuevoEstado = nuevoEstadoRaw as EstadoPlan
    }

    // Una respuesta válida = comentario o archivo (eso es la "evidencia"
    // que exige el plan; un comentario solo ya alcanza para cerrar).
    if (!tieneArchivo && !comentario) {
      return { error: "Respondé con un comentario o adjuntá un archivo" }
    }

    let archivos: ArchivoAvance[] = []
    if (tieneArchivo) {
      const subida = await subirArchivosAvance(supabase, BUCKET, planId, files)
      if ("error" in subida) return { error: subida.error }
      archivos = subida.archivos
    }
    const paths = archivos.map((a) => a.path)

    const { data: avance, error: errAv } = await supabase
      .from("planes_accion_avances")
      .insert({
        plan_id: planId,
        comentario,
        ...columnasArchivos(archivos),
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select("*")
      .single()

    if (errAv || !avance) {
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      return {
        error: errAv?.message ?? "No se pudo registrar el avance",
      }
    }

    if (nuevoEstado && nuevoEstado !== estadoAnterior) {
      const updates: { estado: EstadoPlan; progreso?: number } = {
        estado: nuevoEstado,
      }
      if (nuevoEstado === "completado") updates.progreso = 100
      const { error: errUpd } = await supabase
        .from("planes_accion")
        .update(updates)
        .eq("id", planId)
      if (errUpd) {
        await supabase
          .from("planes_accion_avances")
          .delete()
          .eq("id", (avance as { id: string }).id)
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
        return { error: errUpd.message }
      }

      await supabase.from("plan_historial").insert({
        plan_id: planId,
        estado_anterior: estadoAnterior,
        estado_nuevo: nuevoEstado,
        changed_by: profile.id,
      })
    }

    // Reprogramar al cerrar: crea una tarea de seguimiento con nueva fecha.
    let seguimientoId: string | undefined
    if (nuevoEstado === "completado" && seguimientoFecha) {
      const seg = await crearSeguimiento(
        supabase,
        planOrigen,
        planId,
        seguimientoFecha,
        profile.id,
      )
      if ("error" in seg) {
        return {
          error: `Tarea cerrada, pero no se pudo crear el seguimiento: ${seg.error}`,
        }
      }
      seguimientoId = seg.id
      revalidatePath(`/planes/${seguimientoId}`)
      revalidatePath("/registro-tareas")
    }

    revalidatePath(`/planes/${planId}`)
    revalidatePath("/planes")
    revalidatePath("/mis-tareas")

    return { data: avance as PlanAvance, seguimientoId }
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
      .select("id, plan_id, autor_id, archivo_path, archivos")
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
      archivos: unknown
    }

    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const { error: errDel } = await supabase
      .from("planes_accion_avances")
      .delete()
      .eq("id", avanceId)
    if (errDel) return { error: errDel.message }

    const paths = archivosDeFila(row).map((a) => a.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(`/planes/${row.plan_id}`)
    return { data: { ok: true } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando el avance",
    }
  }
}

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getEmpleadoIdFromAuth } from "@/lib/session"
import type {
  FeedbackAdjunto,
  FeedbackEmpleado,
  FeedbackInput,
  UploadedFeedbackFoto,
} from "@/types/feedback-empleados"

const BUCKET = "feedback-empleados"
const MI_FEEDBACK_PATH = "/mi-feedback"
const GESTION_PATH = "/feedback-empleados"

type Result<T> = { data: T } | { error: string }

const PUEDE_GESTIONAR = ["admin", "supervisor", "admin_rrhh"]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adjuntoConUrl(supabase: any, a: FeedbackAdjunto): FeedbackAdjunto {
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path)
  return { ...a, url: pub.publicUrl as string }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function conAdjuntos(supabase: any, filas: FeedbackEmpleado[]): Promise<FeedbackEmpleado[]> {
  if (filas.length === 0) return []
  const { data: adj } = await supabase
    .from("feedback_empleados_adjuntos")
    .select("*")
    .in("feedback_id", filas.map((f) => f.id))
  const porFeedback = new Map<string, FeedbackAdjunto[]>()
  for (const a of (adj ?? []) as FeedbackAdjunto[]) {
    const lista = porFeedback.get(a.feedback_id) ?? []
    lista.push(adjuntoConUrl(supabase, a))
    porFeedback.set(a.feedback_id, lista)
  }
  return filas.map((f) => ({ ...f, adjuntos: porFeedback.get(f.id) ?? [] }))
}

// ===================================================
// Crear (empleado)
// ===================================================

// Las fotos se suben desde el cliente directo al bucket (evita el límite de
// body de Vercel en Server Actions); acá sólo llegan los storage paths.
export async function createFeedback(
  input: FeedbackInput,
  fotos: UploadedFeedbackFoto[] = []
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!input.titulo?.trim()) return { error: "Contá en una línea de qué se trata." }
    if (!input.descripcion?.trim()) return { error: "La descripción es obligatoria." }
    if (!input.categoria) return { error: "Elegí una categoría." }

    // Nombre y sector se guardan desnormalizados: si la persona cambia de
    // sector o se da de baja, el histórico de la matinal no se rompe.
    const empleadoId = await getEmpleadoIdFromAuth()
    let empleadoNombre: string | null = profile.nombre ?? null
    let sector: string | null = null
    if (empleadoId) {
      const { data: emp } = await supabase
        .from("empleados")
        .select("nombre, sector")
        .eq("id", empleadoId)
        .single()
      if (emp) {
        empleadoNombre = (emp.nombre as string) ?? empleadoNombre
        sector = (emp.sector as string) ?? null
      }
    }

    const { data, error } = await supabase
      .from("feedback_empleados")
      .insert({
        fecha: input.fecha || new Date().toISOString().slice(0, 10),
        categoria: input.categoria,
        criticidad: input.criticidad ?? "media",
        titulo: input.titulo.trim(),
        descripcion: input.descripcion.trim(),
        creado_por: profile.id,
        empleado_id: empleadoId,
        empleado_nombre: empleadoNombre,
        sector,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }

    if (fotos.length > 0) {
      const { error: eAdj } = await supabase.from("feedback_empleados_adjuntos").insert(
        fotos.map((f) => ({
          feedback_id: data.id as string,
          storage_path: f.storage_path,
          nombre_original: f.nombre_original,
          mime_type: f.mime_type,
          tamaño_bytes: f.tamaño_bytes,
          creado_por: profile.id,
        }))
      )
      if (eAdj) return { error: `Se guardó el feedback pero falló la foto: ${eAdj.message}` }
    }

    revalidatePath(MI_FEEDBACK_PATH)
    revalidatePath(GESTION_PATH)
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error enviando el feedback." }
  }
}

// ===================================================
// Lectura
// ===================================================

/** Lo que mandó el usuario logueado, con su estado y la respuesta. */
export async function getMiFeedback(): Promise<Result<FeedbackEmpleado[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("feedback_empleados")
      .select("*")
      .eq("creado_por", profile.id)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    return { data: await conAdjuntos(supabase, (data ?? []) as FeedbackEmpleado[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tu feedback." }
  }
}

/** Back-office: todo el feedback, opcionalmente filtrado por estado. */
export async function getFeedbackGestion(
  estado?: string
): Promise<Result<FeedbackEmpleado[]>> {
  try {
    const profile = await requireAuth()
    if (!PUEDE_GESTIONAR.includes(profile.role)) {
      return { error: "No tenés permiso para ver el feedback." }
    }
    const supabase = await createClient()
    let q = supabase.from("feedback_empleados").select("*")
    if (estado && estado !== "todos") q = q.eq("estado", estado)
    const { data, error } = await q.order("created_at", { ascending: false })
    if (error) return { error: error.message }
    return { data: await conAdjuntos(supabase, (data ?? []) as FeedbackEmpleado[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el feedback." }
  }
}

/**
 * Feedback que le toca a una matinal: todo lo que sigue SIN tratar más lo que
 * ya se trató en esa misma reunión (para que no desaparezca de la pantalla al
 * marcarlo). No se filtra por fecha a propósito: si un día no hubo matinal, el
 * tema tiene que arrastrarse a la siguiente en vez de perderse.
 *
 * El orden es por criticidad y después por antigüedad, para que el que conduce
 * barra de arriba hacia abajo.
 */
export async function getFeedbackParaReunion(
  reunionId: string
): Promise<Result<FeedbackEmpleado[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("feedback_empleados")
      .select("*")
      .or(`estado.eq.nuevo,reunion_id.eq.${reunionId}`)
      .order("created_at", { ascending: true })
    if (error) return { error: error.message }

    const peso = { alta: 0, media: 1, baja: 2 } as const
    const filas = ((data ?? []) as FeedbackEmpleado[]).sort(
      (a, b) => peso[a.criticidad] - peso[b.criticidad]
    )
    return { data: await conAdjuntos(supabase, filas) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el feedback." }
  }
}

// ===================================================
// Gestión (matinal / back-office)
// ===================================================

/** Marca el tema como tratado en una reunión y le responde al empleado. */
export async function tratarFeedback(
  id: string,
  input: { respuesta: string; reunionId?: string | null; estado?: "tratado" | "con_accion" | "cerrado" }
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    if (!PUEDE_GESTIONAR.includes(profile.role)) {
      return { error: "Sólo admin o supervisor pueden tratar el feedback." }
    }
    if (!input.respuesta?.trim()) {
      return { error: "Escribí qué se le responde al empleado." }
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from("feedback_empleados")
      .update({
        estado: input.estado ?? "tratado",
        respuesta: input.respuesta.trim(),
        reunion_id: input.reunionId ?? null,
      })
      .eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(MI_FEEDBACK_PATH)
    revalidatePath(GESTION_PATH)
    revalidatePath("/reuniones")
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error tratando el feedback." }
  }
}

/**
 * Deriva el feedback a una acción del action log de la reunión y lo deja
 * enlazado. Es lo que hace que el ciclo cierre: el tema no queda "charlado",
 * queda con responsable y fecha.
 */
export async function derivarFeedbackAActividad(
  id: string,
  input: { reunionId: string; descripcion: string; responsableId?: string | null; fechaCompromiso?: string | null }
): Promise<Result<{ actividadId: string }>> {
  try {
    const profile = await requireAuth()
    if (!PUEDE_GESTIONAR.includes(profile.role)) {
      return { error: "Sólo admin o supervisor pueden derivar el feedback." }
    }
    if (!input.descripcion?.trim()) return { error: "Describí la acción a tomar." }
    const supabase = await createClient()

    const { data: act, error: eAct } = await supabase
      .from("reuniones_actividades")
      .insert({
        reunion_id: input.reunionId,
        descripcion: input.descripcion.trim(),
        responsable_id: input.responsableId ?? null,
        fecha_compromiso: input.fechaCompromiso ?? null,
        estado: "no_comenzada",
        destino: "simple",
        seccion: "feedback",
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (eAct) return { error: eAct.message }

    const { error: eFb } = await supabase
      .from("feedback_empleados")
      .update({
        estado: "con_accion",
        reunion_id: input.reunionId,
        actividad_id: act.id as string,
      })
      .eq("id", id)
    if (eFb) return { error: eFb.message }

    revalidatePath(MI_FEEDBACK_PATH)
    revalidatePath(GESTION_PATH)
    revalidatePath(`/reuniones/${input.reunionId}`)
    return { data: { actividadId: act.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error derivando el feedback." }
  }
}

/** KPI para el punto 2.2: cuántos se reciben y cuántos efectivamente se cierran. */
export async function getFeedbackResumen(): Promise<
  Result<{ total: number; nuevos: number; tratados: number; con_accion: number; cerrados: number }>
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.from("feedback_empleados").select("estado")
    if (error) return { error: error.message }
    const filas = (data ?? []) as { estado: string }[]
    return {
      data: {
        total: filas.length,
        nuevos: filas.filter((f) => f.estado === "nuevo").length,
        tratados: filas.filter((f) => f.estado === "tratado").length,
        con_accion: filas.filter((f) => f.estado === "con_accion").length,
        cerrados: filas.filter((f) => f.estado === "cerrado").length,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error calculando el resumen." }
  }
}

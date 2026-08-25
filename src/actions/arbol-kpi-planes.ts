// Planes de acción del Árbol de KPI.
//
// Clon de `tiempo-pdv-planes.ts` (mismo modelo de datos, RLS y avances con
// evidencia). La diferencia es el foco: acá el plan se ata al NODO del árbol,
// que es la unidad sobre la que se decide actuar cuando un driver se va de
// meta. Guarda además la causa raíz y el valor de arranque, que es lo que la
// auditoría pide para el PDCA (punto Gestión 4.3).
//
// Se usa este molde y no el de `tml_plan_accion` porque aquél guarda el
// responsable como texto libre y por eso quedó fuera del tablero unificado de
// `/planes`.

"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { registerActivity } from "@/lib/dpo-activity"
import {
  archivosDeFila,
  archivosDelForm,
  columnasArchivos,
  subirArchivosAvance,
  type ArchivoAvance,
} from "@/lib/adjuntos-avance"

const BUCKET = "arbol-kpi-planes"
const ARBOL_PATH = "/arbol-kpi"

export type EstadoArbolKpiPlan = "pendiente" | "en_progreso" | "completado"
export type PrioridadArbolKpiPlan = "alta" | "media" | "baja"

const ESTADOS_VALIDOS: EstadoArbolKpiPlan[] = ["pendiente", "en_progreso", "completado"]
const PRIORIDADES_VALIDAS: PrioridadArbolKpiPlan[] = ["alta", "media", "baja"]

type Result<T> = { data: T } | { error: string }

export interface ArbolKpiPlan {
  id: string
  titulo: string
  descripcion: string | null
  /** Árbol al que pertenece el nodo (hoy siempre "rechazo"). */
  arbol: string
  /** Nodo del árbol sobre el que se actúa: el foco del plan. */
  nodo_key: string
  /** Nombre del nodo al crear el plan; queda fijo aunque la topología cambie. */
  nodo_label: string | null
  nodo_nivel: string | null
  /** PDCA: por qué pasa lo que pasa. */
  causa_raiz: string | null
  /** Valor del indicador al abrir el plan, para medir el cierre contra algo. */
  baseline_valor: number | null
  baseline_fecha: string | null
  /** Meta vigente al abrirlo. */
  meta_valor: number | null
  prioridad: PrioridadArbolKpiPlan
  estado: EstadoArbolKpiPlan
  responsable_id: string | null
  responsable_nombre: string | null
  fecha_objetivo: string | null
  created_by: string | null
  created_by_nombre: string | null
  created_at: string
  updated_at: string
  avances_count: number
}

export interface ArbolKpiPlanAvance {
  id: string
  plan_id: string
  comentario: string | null
  /** Todos los adjuntos del avance. Los avances viejos traen acá su único archivo. */
  archivos: ArchivoAvance[]
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_mime: string | null
  archivo_bytes: number | null
  estado_resultante: EstadoArbolKpiPlan | null
  autor_id: string | null
  autor_nombre: string | null
  created_at: string
}

export interface ArbolKpiPlanFiltro {
  nodo_key?: string
  arbol?: string
  estado?: EstadoArbolKpiPlan
}

function isEditorRole(role: string): boolean {
  return ["admin", "supervisor", "admin_rrhh"].includes(role)
}

// ------------------------------------------------------------------
// Listado de planes (con autor, responsable y conteo de avances)
// ------------------------------------------------------------------
export async function listarPlanesArbolKpi(
  filtro?: ArbolKpiPlanFiltro,
): Promise<Result<ArbolKpiPlan[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let q = supabase
      .from("arbol_kpi_planes")
      .select(
        "*, responsable:profiles!arbol_kpi_planes_responsable_id_fkey(id, nombre), autor:profiles!arbol_kpi_planes_created_by_fkey(id, nombre)",
      )
      .order("created_at", { ascending: false })

    if (filtro?.nodo_key) q = q.eq("nodo_key", filtro.nodo_key)
    if (filtro?.arbol) q = q.eq("arbol", filtro.arbol)
    if (filtro?.estado) q = q.eq("estado", filtro.estado)

    const { data, error } = await q
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
    const ids = rows.map((r) => r.id as string)

    const countMap = new Map<string, number>()
    if (ids.length) {
      const { data: avs } = await supabase
        .from("arbol_kpi_planes_avances")
        .select("plan_id")
        .in("plan_id", ids)
      for (const a of (avs ?? []) as Array<{ plan_id: string }>) {
        countMap.set(a.plan_id, (countMap.get(a.plan_id) ?? 0) + 1)
      }
    }

    const planes: ArbolKpiPlan[] = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      return {
        id: r.id,
        titulo: r.titulo,
        descripcion: r.descripcion ?? null,
        arbol: r.arbol ?? "rechazo",
        nodo_key: r.nodo_key,
        nodo_label: r.nodo_label ?? null,
        nodo_nivel: r.nodo_nivel ?? null,
        causa_raiz: r.causa_raiz ?? null,
        baseline_valor: r.baseline_valor == null ? null : Number(r.baseline_valor),
        baseline_fecha: r.baseline_fecha ?? null,
        meta_valor: r.meta_valor == null ? null : Number(r.meta_valor),
        prioridad: (r.prioridad as PrioridadArbolKpiPlan) ?? "media",
        estado: (r.estado as EstadoArbolKpiPlan) ?? "pendiente",
        responsable_id: r.responsable_id ?? null,
        responsable_nombre: r.responsable?.nombre ?? null,
        fecha_objetivo: r.fecha_objetivo ?? null,
        created_by: r.created_by ?? null,
        created_by_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        avances_count: countMap.get(r.id) ?? 0,
      }
    })

    return { data: planes }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los planes" }
  }
}

// ------------------------------------------------------------------
// Crear plan
// ------------------------------------------------------------------
export async function crearPlanArbolKpi(
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
    const prioridad = PRIORIDADES_VALIDAS.includes(prioridadRaw as PrioridadArbolKpiPlan)
      ? (prioridadRaw as PrioridadArbolKpiPlan)
      : "media"

    const nodoKey = String(formData.get("nodo_key") ?? "").trim()
    if (!nodoKey) return { error: "Falta el indicador sobre el que se actúa" }
    const arbol = String(formData.get("arbol") ?? "rechazo").trim() || "rechazo"
    const nodoLabel = String(formData.get("nodo_label") ?? "").trim() || null
    const nodoNivel = String(formData.get("nodo_nivel") ?? "").trim() || null
    const causaRaiz = String(formData.get("causa_raiz") ?? "").trim() || null
    const numeroOpcional = (campo: string): number | null => {
      const crudo = String(formData.get(campo) ?? "").trim()
      if (crudo === "") return null
      const n = Number(crudo.replace(",", "."))
      return Number.isFinite(n) ? n : null
    }
    const baselineValor = numeroOpcional("baseline_valor")
    const metaValor = numeroOpcional("meta_valor")
    const responsableId =
      String(formData.get("responsable_id") ?? "").trim() || null
    const fechaObjetivo =
      String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { data, error } = await supabase
      .from("arbol_kpi_planes")
      .insert({
        titulo,
        descripcion,
        prioridad,
        estado: "pendiente",
        arbol,
        nodo_key: nodoKey,
        nodo_label: nodoLabel,
        nodo_nivel: nodoNivel,
        causa_raiz: causaRaiz,
        baseline_valor: baselineValor,
        // Foto del momento en que se abrió: contra esto se mide el cierre.
        baseline_fecha: baselineValor == null ? null : new Date().toISOString(),
        meta_valor: metaValor,
        responsable_id: responsableId,
        fecha_objetivo: fechaObjetivo,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (!error && data) {
      // Deja rastro en la actividad DPO contra el punto que este árbol responde
      // (Gestión 2.3, «Desarrollar arból de KPIs», hoy nota 0 y mandatorio).
      await registerActivity(supabase, {
        tipo: "plan_creado",
        titulo: `Plan de acción — ${nodoLabel ?? nodoKey}`,
        descripcion: titulo,
        pilar_codigo: "gestion",
        punto_codigo: "2.3",
        referencia_id: data.id,
        referencia_tipo: "arbol_kpi_plan",
        user_id: profile.id,
        user_nombre: profile.nombre,
        metadata: {
          arbol,
          nodo_key: nodoKey,
          baseline_valor: baselineValor,
          meta_valor: metaValor,
        },
      })
    }

    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear el plan" }
    }

    revalidatePath(ARBOL_PATH)
    return { data: { id: (data as { id: string }).id } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando el plan" }
  }
}

// ------------------------------------------------------------------
// Actualizar plan (campos editables)
// ------------------------------------------------------------------
export async function actualizarPlanArbolKpi(
  planId: string,
  formData: FormData,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("arbol_kpi_planes")
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
      if (PRIORIDADES_VALIDAS.includes(pr as PrioridadArbolKpiPlan)) updates.prioridad = pr
    }
    if (formData.has("estado")) {
      const es = String(formData.get("estado") ?? "").trim()
      if (!ESTADOS_VALIDOS.includes(es as EstadoArbolKpiPlan))
        return { error: "Estado inválido" }
      updates.estado = es
    }
    if (formData.has("causa_raiz"))
      updates.causa_raiz = String(formData.get("causa_raiz") ?? "").trim() || null
    if (formData.has("responsable_id"))
      updates.responsable_id =
        String(formData.get("responsable_id") ?? "").trim() || null
    if (formData.has("fecha_objetivo"))
      updates.fecha_objetivo =
        String(formData.get("fecha_objetivo") ?? "").trim() || null

    const { error } = await supabase
      .from("arbol_kpi_planes")
      .update(updates)
      .eq("id", planId)
    if (error) return { error: error.message }

    revalidatePath(ARBOL_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error actualizando el plan" }
  }
}

// ------------------------------------------------------------------
// Eliminar plan (cascade borra avances; limpiamos archivos del bucket)
// ------------------------------------------------------------------
export async function eliminarPlanArbolKpi(
  planId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("arbol_kpi_planes")
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

    // Un avance puede tener varios archivos (columna `archivos`); los viejos
    // sólo tienen archivo_path. archivosDeFila() cubre los dos casos.
    const { data: avs } = await supabase
      .from("arbol_kpi_planes_avances")
      .select("archivos, archivo_path, archivo_nombre, archivo_mime, archivo_bytes")
      .eq("plan_id", planId)
    const paths = (
      (avs ?? []) as Array<{
        archivos: unknown
        archivo_path: string | null
      }>
    ).flatMap((a) => archivosDeFila(a).map((x) => x.path))

    const { error } = await supabase.from("arbol_kpi_planes").delete().eq("id", planId)
    if (error) return { error: error.message }

    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(ARBOL_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando el plan" }
  }
}

// ------------------------------------------------------------------
// Avances (seguimiento + evidencia)
// ------------------------------------------------------------------
export async function listarAvancesPlanArbolKpi(
  planId: string,
): Promise<Result<ArbolKpiPlanAvance[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data, error } = await supabase
      .from("arbol_kpi_planes_avances")
      .select("*, autor:profiles!arbol_kpi_planes_avances_autor_id_fkey(id, nombre)")
      .eq("plan_id", planId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const avances: ArbolKpiPlanAvance[] = (
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
        estado_resultante: (r.estado_resultante as EstadoArbolKpiPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      }
    })
    return { data: avances }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los avances" }
  }
}

export async function agregarAvancePlanArbolKpi(
  planId: string,
  formData: FormData,
): Promise<Result<ArbolKpiPlanAvance>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!planId) return { error: "ID de plan inválido" }

    const { data: plan, error: errP } = await supabase
      .from("arbol_kpi_planes")
      .select("estado, created_by, responsable_id")
      .eq("id", planId)
      .single()
    if (errP || !plan) return { error: errP?.message ?? "Plan no encontrado" }
    const planRow = plan as {
      estado: EstadoArbolKpiPlan
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

    let nuevoEstado: EstadoArbolKpiPlan | null = null
    if (nuevoEstadoRaw) {
      if (!ESTADOS_VALIDOS.includes(nuevoEstadoRaw as EstadoArbolKpiPlan))
        return { error: "Estado inválido" }
      nuevoEstado = nuevoEstadoRaw as EstadoArbolKpiPlan
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
      .from("arbol_kpi_planes_avances")
      .insert({
        plan_id: planId,
        comentario,
        ...columnasArchivos(archivos),
        estado_resultante: nuevoEstado,
        autor_id: profile.id,
      })
      .select("*, autor:profiles!arbol_kpi_planes_avances_autor_id_fkey(id, nombre)")
      .single()

    if (errAv || !avance) {
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
      return { error: errAv?.message ?? "No se pudo registrar el avance" }
    }

    if (nuevoEstado && nuevoEstado !== planRow.estado) {
      const { error: errUpd } = await supabase
        .from("arbol_kpi_planes")
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq("id", planId)
      if (errUpd) {
        await supabase
          .from("arbol_kpi_planes_avances")
          .delete()
          .eq("id", (avance as { id: string }).id)
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
        return { error: errUpd.message }
      }
    }

    revalidatePath(ARBOL_PATH)

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
        estado_resultante: (r.estado_resultante as EstadoArbolKpiPlan | null) ?? null,
        autor_id: r.autor_id ?? null,
        autor_nombre: r.autor?.nombre ?? null,
        created_at: r.created_at,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error registrando el avance" }
  }
}

export async function eliminarAvancePlanArbolKpi(
  avanceId: string,
): Promise<Result<{ ok: true }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    if (!avanceId) return { error: "ID de avance inválido" }

    const { data: avance, error: errA } = await supabase
      .from("arbol_kpi_planes_avances")
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
    }
    if (!isEditorRole(profile.role) && row.autor_id !== profile.id) {
      return { error: "Solo el autor o un editor puede eliminar el avance" }
    }

    const { error: errDel } = await supabase
      .from("arbol_kpi_planes_avances")
      .delete()
      .eq("id", avanceId)
    if (errDel) return { error: errDel.message }

    const paths = archivosDeFila(row).map((a) => a.path)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

    revalidatePath(ARBOL_PATH)
    return { data: { ok: true } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando el avance" }
  }
}

export async function getAvanceArbolKpiSignedUrl(
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
    return { error: err instanceof Error ? err.message : "Error generando URL" }
  }
}

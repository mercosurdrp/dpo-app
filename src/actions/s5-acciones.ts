"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuth } from "@/lib/session"
import type {
  S5Tipo,
  S5Accion,
  S5AccionEstado,
  S5AccionConMeta,
  S5AccionEvidencia,
} from "@/types/database"

const DASHBOARD_PATH = "/5s"

function assertAuditorOrAdmin(role: string) {
  if (role !== "admin" && role !== "auditor") {
    throw new Error("Sólo admin o auditor puede realizar esta acción.")
  }
}

/**
 * Espeja un cambio a la actividad de reuniones enlazada (origen_reunion_actividad_id).
 *
 * Usa el cliente admin (service-role) a propósito: el cierre/avance de una
 * acción 5S lo dispara su responsable — habitualmente un operario sin rol
 * editor — y la RLS de `reuniones_actividades` sólo deja escribir a editores
 * (admin/supervisor/admin_rrhh) o al responsable de ESA fila. Con el cliente
 * de usuario el UPDATE se rechazaba en silencio y la actividad de la reunión
 * quedaba huérfana: cerrada en 5S / Mis Tareas pero abierta en Reuniones.
 */
async function espejarEstadoActividad(
  actividadId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch: Record<string, any>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return
  try {
    const { error } = await createAdminClient()
      .from("reuniones_actividades")
      .update(patch)
      .eq("id", actividadId)
    if (error) {
      console.error(
        `[s5-acciones] no se pudo espejar a reuniones_actividades ${actividadId}: ${error.message}`,
      )
    }
  } catch (err) {
    console.error("[s5-acciones] error espejando a reuniones_actividades:", err)
  }
}

function truncar(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

// Notificación in-app para el responsable asignado de una acción 5S.
// Failure no bloquea la operación.
async function notificarAsignacionAccion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  responsableId: string,
  descripcion: string,
  tipo: S5Tipo
): Promise<void> {
  try {
    await supabase.from("notificaciones").insert({
      user_id: responsableId,
      tipo: "s5_accion_asignada",
      titulo: `Nueva acción 5S: ${truncar(descripcion, 60)}`,
      mensaje: `Te asignaron una acción 5S de ${tipo === "flota" ? "Flota" : "Almacén"}.`,
      link: "/mis-tareas",
    })
  } catch {
    // silent
  }
}

// FK constraint names (auto-generados por Postgres) — explícitos
// porque s5_acciones tiene múltiples FKs a profiles.
const SELECT_ACCION_RELS = `
  responsable:profiles!s5_acciones_responsable_id_fkey(id, nombre),
  creado_por_profile:profiles!s5_acciones_creado_por_fkey(id, nombre),
  cerrada_por_profile:profiles!s5_acciones_cerrada_por_fkey(id, nombre),
  vehiculo:catalogo_vehiculos!s5_acciones_vehiculo_id_fkey(id, dominio),
  origen_actividad:reuniones_actividades!s5_acciones_origen_reunion_actividad_id_fkey(reunion_id)
` as const

type AccionRawRow = S5Accion & {
  responsable: { id: string; nombre: string } | null
  creado_por_profile: { id: string; nombre: string } | null
  cerrada_por_profile: { id: string; nombre: string } | null
  vehiculo: { id: string; dominio: string } | null
  origen_actividad: { reunion_id: string } | null
}

function enrichAccion(
  row: AccionRawRow,
  evidenciasCount: number
): S5AccionConMeta {
  return {
    id: row.id,
    tipo: row.tipo,
    sector_numero: row.sector_numero,
    vehiculo_id: row.vehiculo_id,
    descripcion: row.descripcion,
    responsable_id: row.responsable_id,
    fecha_compromiso: row.fecha_compromiso,
    estado: row.estado,
    origen_auditoria_id: row.origen_auditoria_id,
    origen_reunion_actividad_id: row.origen_reunion_actividad_id,
    creado_por: row.creado_por,
    cerrada_at: row.cerrada_at,
    cerrada_por: row.cerrada_por,
    created_at: row.created_at,
    updated_at: row.updated_at,
    responsable_nombre: row.responsable?.nombre ?? null,
    creado_por_nombre: row.creado_por_profile?.nombre ?? null,
    cerrada_por_nombre: row.cerrada_por_profile?.nombre ?? null,
    vehiculo_dominio: row.vehiculo?.dominio ?? null,
    evidencias_count: evidenciasCount,
    origen_reunion_id: row.origen_actividad?.reunion_id ?? null,
  }
}

// ===================================================
// Listar acciones (con meta)
// ===================================================
export interface ListarAccionesFilters {
  estado?: S5AccionEstado
  tipo?: S5Tipo
  responsableId?: string
  origenAuditoriaId?: string
  soloMias?: boolean
}

export async function listarAcciones(
  filters?: ListarAccionesFilters
): Promise<{ data: S5AccionConMeta[] } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("s5_acciones")
      .select(
        `*, ${SELECT_ACCION_RELS}, evidencias:s5_acciones_evidencias(id)`
      )
      .order("created_at", { ascending: false })

    if (filters?.estado) query = query.eq("estado", filters.estado)
    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.responsableId) {
      query = query.eq("responsable_id", filters.responsableId)
    }
    if (filters?.origenAuditoriaId) {
      query = query.eq("origen_auditoria_id", filters.origenAuditoriaId)
    }
    if (filters?.soloMias) {
      query = query.eq("responsable_id", profile.id)
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    const rows = (data ?? []) as unknown as Array<
      AccionRawRow & { evidencias: { id: string }[] }
    >

    return {
      data: rows.map((r) => enrichAccion(r, r.evidencias?.length ?? 0)),
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error listando acciones",
    }
  }
}

// ===================================================
// Detalle: acción + evidencias ordenadas cronológicamente
// ===================================================
export async function getAccionDetalle(id: string): Promise<
  | {
      data: { accion: S5AccionConMeta; evidencias: S5AccionEvidencia[] }
    }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: accionRaw, error: accErr } = await supabase
      .from("s5_acciones")
      .select(`*, ${SELECT_ACCION_RELS}`)
      .eq("id", id)
      .maybeSingle()

    if (accErr) return { error: accErr.message }
    if (!accionRaw) return { error: "Acción no encontrada" }

    const { data: evidenciasRaw, error: evErr } = await supabase
      .from("s5_acciones_evidencias")
      .select(
        `*, autor:profiles!s5_acciones_evidencias_autor_id_fkey(id, nombre)`
      )
      .eq("accion_id", id)
      .order("created_at", { ascending: true })

    if (evErr) return { error: evErr.message }

    const evidenciasArr = (evidenciasRaw ?? []) as unknown as Array<
      S5AccionEvidencia & { autor: { id: string; nombre: string } | null }
    >

    const evidencias: S5AccionEvidencia[] = evidenciasArr.map((e) => ({
      id: e.id,
      accion_id: e.accion_id,
      comentario: e.comentario,
      archivo_path: e.archivo_path,
      archivo_nombre: e.archivo_nombre,
      archivo_mime: e.archivo_mime,
      archivo_bytes: e.archivo_bytes,
      autor_id: e.autor_id,
      autor_nombre: e.autor?.nombre ?? null,
      created_at: e.created_at,
    }))

    const accion = enrichAccion(
      accionRaw as unknown as AccionRawRow,
      evidencias.length
    )

    return { data: { accion, evidencias } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando acción",
    }
  }
}

// ===================================================
// Crear acción (aislada o linked a auditoría).
// Si vienen evidenciaInicial* (comentario y/o archivo), se inserta como
// PRIMERA fila del historial sin promover el estado (queda no_comenzada).
// El cliente puede pasar `id` (UUID generado client-side) para usar como
// folder del path del archivo en storage.
// ===================================================
export interface CrearAccionInput {
  id?: string
  tipo: S5Tipo
  sectorNumero?: number | null
  vehiculoId?: string | null
  descripcion: string
  responsableId: string
  fechaCompromiso?: string | null
  origenAuditoriaId?: string | null
  evidenciaInicialComentario?: string | null
  evidenciaInicialArchivoPath?: string | null
  evidenciaInicialArchivoNombre?: string | null
  evidenciaInicialArchivoMime?: string | null
  evidenciaInicialArchivoBytes?: number | null
}

export async function crearAccion(
  input: CrearAccionInput
): Promise<{ data: S5Accion } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)

    if (!input.descripcion?.trim()) {
      return { error: "La descripción es obligatoria" }
    }
    if (input.tipo === "almacen") {
      const s = input.sectorNumero
      if (typeof s !== "number" || s < 1 || s > 4) {
        return { error: "Para tipo 'almacen' el sector debe estar entre 1 y 4" }
      }
    }
    if (!input.responsableId) {
      return { error: "Debe asignar un responsable" }
    }

    const supabase = await createClient()

    const insertPayload: Record<string, unknown> = {
      tipo: input.tipo,
      sector_numero:
        input.tipo === "almacen" ? input.sectorNumero ?? null : null,
      vehiculo_id:
        input.tipo === "flota" ? input.vehiculoId ?? null : null,
      descripcion: input.descripcion.trim(),
      responsable_id: input.responsableId,
      fecha_compromiso: input.fechaCompromiso ?? null,
      estado: "no_comenzada",
      origen_auditoria_id: input.origenAuditoriaId ?? null,
      creado_por: profile.id,
    }
    if (input.id) insertPayload.id = input.id

    const { data, error } = await supabase
      .from("s5_acciones")
      .insert(insertPayload)
      .select("*")
      .single()

    if (error) return { error: error.message }

    const accion = data as S5Accion

    // Si vino evidencia inicial, insertarla SIN promover estado.
    const comentarioIni = input.evidenciaInicialComentario?.trim() || null
    const hasArchivoIni = !!input.evidenciaInicialArchivoPath
    if (comentarioIni || hasArchivoIni) {
      const { error: evErr } = await supabase
        .from("s5_acciones_evidencias")
        .insert({
          accion_id: accion.id,
          comentario: comentarioIni,
          archivo_path: input.evidenciaInicialArchivoPath ?? null,
          archivo_nombre: input.evidenciaInicialArchivoNombre ?? null,
          archivo_mime: input.evidenciaInicialArchivoMime ?? null,
          archivo_bytes: input.evidenciaInicialArchivoBytes ?? null,
          autor_id: profile.id,
        })
      if (evErr) {
        // Rollback manual: borrar la acción recién creada para no dejar
        // huérfana sin la evidencia inicial que el usuario quería.
        await supabase.from("s5_acciones").delete().eq("id", accion.id)
        return { error: `Error guardando evidencia inicial: ${evErr.message}` }
      }
    }

    if (accion.responsable_id) {
      await notificarAsignacionAccion(
        supabase,
        accion.responsable_id,
        accion.descripcion,
        accion.tipo
      )
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: accion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando acción",
    }
  }
}

// ===================================================
// Actualizar acción (admin/auditor o responsable)
// Cambios de estado: solo no_comenzada ↔ en_curso aquí.
// Para cerrar usar cerrarAccion (requiere evidencia).
// ===================================================
export interface ActualizarAccionInput {
  descripcion?: string
  responsableId?: string
  fechaCompromiso?: string | null
  estado?: Exclude<S5AccionEstado, "cerrada">
}

export async function actualizarAccion(
  id: string,
  patch: ActualizarAccionInput
): Promise<{ data: S5Accion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const update: Record<string, unknown> = {}
    if (patch.descripcion !== undefined) {
      if (!patch.descripcion.trim()) return { error: "Descripción inválida" }
      update.descripcion = patch.descripcion.trim()
    }
    if (patch.responsableId !== undefined) {
      update.responsable_id = patch.responsableId
    }
    if (patch.fechaCompromiso !== undefined) {
      update.fecha_compromiso = patch.fechaCompromiso
    }
    if (patch.estado !== undefined) {
      update.estado = patch.estado
    }

    if (Object.keys(update).length === 0) {
      return { error: "Nada para actualizar" }
    }

    // Si va a cambiar el responsable, cargar el anterior para comparar.
    let prevResponsableId: string | null = null
    if (patch.responsableId !== undefined) {
      const { data: prev } = await supabase
        .from("s5_acciones")
        .select("responsable_id")
        .eq("id", id)
        .maybeSingle()
      prevResponsableId =
        (prev as { responsable_id: string | null } | null)?.responsable_id ??
        null
    }

    const { data, error } = await supabase
      .from("s5_acciones")
      .update(update)
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }

    const accion = data as S5Accion

    // Si cambió el responsable a uno nuevo no-nulo, notificar.
    if (
      patch.responsableId !== undefined &&
      accion.responsable_id &&
      accion.responsable_id !== prevResponsableId
    ) {
      await notificarAsignacionAccion(
        supabase,
        accion.responsable_id,
        accion.descripcion,
        accion.tipo
      )
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: accion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando acción",
    }
  }
}

// ===================================================
// Agregar evidencia (responsable, creador o admin/auditor).
// Archivo se sube cliente-side al bucket 's5-auditorias'.
// Esta función solo registra metadata + auto-promueve a 'en_curso' si correspondía.
// ===================================================
export interface AgregarEvidenciaInput {
  accionId: string
  comentario?: string | null
  archivoPath?: string | null
  archivoNombre?: string | null
  archivoMime?: string | null
  archivoBytes?: number | null
}

export async function agregarEvidencia(
  input: AgregarEvidenciaInput
): Promise<{ data: S5AccionEvidencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const comentario = input.comentario?.trim() || null
    const hasArchivo = !!input.archivoPath

    if (!comentario && !hasArchivo) {
      return { error: "Debe incluir un comentario o un archivo" }
    }

    const { data: accion, error: accErr } = await supabase
      .from("s5_acciones")
      .select(
        "id, responsable_id, creado_por, estado, origen_reunion_actividad_id"
      )
      .eq("id", input.accionId)
      .maybeSingle()

    if (accErr) return { error: accErr.message }
    if (!accion) return { error: "Acción no encontrada" }
    if (accion.estado === "cerrada") {
      return { error: "La acción está cerrada" }
    }

    const isAuthorized =
      accion.responsable_id === profile.id ||
      accion.creado_por === profile.id ||
      profile.role === "admin" ||
      profile.role === "auditor"

    if (!isAuthorized) {
      return { error: "No tenés permiso para agregar evidencia" }
    }

    const { data, error } = await supabase
      .from("s5_acciones_evidencias")
      .insert({
        accion_id: input.accionId,
        comentario,
        archivo_path: input.archivoPath ?? null,
        archivo_nombre: input.archivoNombre ?? null,
        archivo_mime: input.archivoMime ?? null,
        archivo_bytes: input.archivoBytes ?? null,
        autor_id: profile.id,
      })
      .select("*")
      .single()

    if (error) return { error: error.message }

    if (accion.estado === "no_comenzada") {
      await supabase
        .from("s5_acciones")
        .update({ estado: "en_curso" })
        .eq("id", input.accionId)
        .eq("estado", "no_comenzada")
    }

    // Espejar a la actividad de reuniones si la acción tiene origen.
    // La actividad solo guarda 1 evidencia (no historial) → sobrescribe.
    if (accion.origen_reunion_actividad_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actividadUpdate: Record<string, any> = {}
      if (input.archivoPath) {
        actividadUpdate.evidencia_url = input.archivoPath
        actividadUpdate.evidencia_nombre = input.archivoNombre ?? null
      }
      if (comentario) {
        actividadUpdate.observaciones = comentario
      }
      // Si la acción pasó de no_comenzada → en_curso por el side-effect del
      // insert, espejar también el estado en la actividad.
      if (accion.estado === "no_comenzada") {
        actividadUpdate.estado = "en_curso"
        actividadUpdate.completado_at = null
      }
      await espejarEstadoActividad(
        accion.origen_reunion_actividad_id,
        actividadUpdate,
      )
    }

    revalidatePath(DASHBOARD_PATH)

    return {
      data: {
        ...(data as Omit<S5AccionEvidencia, "autor_nombre">),
        autor_nombre: profile.nombre ?? null,
      } as S5AccionEvidencia,
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error agregando evidencia",
    }
  }
}

// ===================================================
// Cerrar acción (requiere ≥1 evidencia)
// ===================================================
export async function cerrarAccion(
  id: string
): Promise<{ data: S5Accion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { count, error: cntErr } = await supabase
      .from("s5_acciones_evidencias")
      .select("id", { count: "exact", head: true })
      .eq("accion_id", id)

    if (cntErr) return { error: cntErr.message }
    if (!count || count < 1) {
      return { error: "Se requiere al menos 1 evidencia para cerrar" }
    }

    const { data, error } = await supabase
      .from("s5_acciones")
      .update({
        estado: "cerrada",
        cerrada_at: new Date().toISOString(),
        cerrada_por: profile.id,
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }
    const accion = data as S5Accion

    // Espejar cierre a la actividad de reuniones.
    if (accion.origen_reunion_actividad_id) {
      await espejarEstadoActividad(accion.origen_reunion_actividad_id, {
        estado: "cerrada",
        completado_at: new Date().toISOString(),
      })
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: accion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cerrando acción",
    }
  }
}

// ===================================================
// Reabrir acción cerrada → en_curso (admin/auditor)
// ===================================================
export async function reabrirAccion(
  id: string
): Promise<{ data: S5Accion } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("s5_acciones")
      .update({
        estado: "en_curso",
        cerrada_at: null,
        cerrada_por: null,
      })
      .eq("id", id)
      .select("*")
      .single()

    if (error) return { error: error.message }
    const accion = data as S5Accion

    // Espejar reapertura a la actividad de reuniones.
    if (accion.origen_reunion_actividad_id) {
      await espejarEstadoActividad(accion.origen_reunion_actividad_id, {
        estado: "en_curso",
        completado_at: null,
      })
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: accion }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error reabriendo acción",
    }
  }
}

// ===================================================
// Listar perfiles asignables como responsables (active=true)
// ===================================================
export async function listResponsablesPosibles(): Promise<
  | { data: { id: string; nombre: string; email: string }[] }
  | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nombre, email")
      .eq("active", true)
      .order("nombre")
    if (error) return { error: error.message }
    return {
      data: (data ?? []) as { id: string; nombre: string; email: string }[],
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando usuarios",
    }
  }
}

// ===================================================
// Generar signed URL para visualizar/descargar evidencia
// ===================================================
export async function getEvidenciaSignedUrl(
  archivoPath: string
): Promise<{ data: { url: string } } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase.storage
      .from("s5-auditorias")
      .createSignedUrl(archivoPath, 60 * 10) // 10 minutos
    if (error) return { error: error.message }
    return { data: { url: data.signedUrl } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error generando URL",
    }
  }
}

// ===================================================
// Eliminar acción (admin/auditor). Cascade borra evidencias.
// ===================================================
export async function eliminarAccion(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    assertAuditorOrAdmin(profile.role)
    const supabase = await createClient()

    const { error } = await supabase.from("s5_acciones").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando acción",
    }
  }
}

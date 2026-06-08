"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  ComunicacionConAutor,
  ComunicacionDetalle,
  ComunicacionAdjunto,
  ComunicacionCategoria,
  ComunicacionPrioridad,
  ComunicacionEstado,
  ComunicacionHistorial,
} from "@/types/database"

const BUCKET = "portal-comunicaciones"
const LIST_PATH = "/portal/comunicaciones"
const ADMIN_PATH = "/portal"

type Result<T> = { data: T } | { error: string }

const SELECT_COM =
  "*, autor:profiles!comunicaciones_creado_por_fkey(nombre), asignado:profiles!comunicaciones_asignado_a_fkey(nombre), comunicacion_adjuntos(count)"

function isAdmin(role: string): boolean {
  return role === "admin"
}

interface ComunicacionFilters {
  estado?: ComunicacionEstado
  categoria?: ComunicacionCategoria
  search?: string
}

interface ComunicacionInput {
  titulo: string
  cuerpo: string
  categoria: ComunicacionCategoria
  prioridad: ComunicacionPrioridad
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapComunicacion(row: any): ComunicacionConAutor {
  return {
    id: row.id,
    numero: row.numero,
    titulo: row.titulo,
    cuerpo: row.cuerpo,
    categoria: row.categoria,
    prioridad: row.prioridad,
    estado: row.estado,
    asignado_a: row.asignado_a,
    creado_por: row.creado_por,
    gestionado_at: row.gestionado_at,
    cerrado_at: row.cerrado_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    autor_nombre: row.autor?.nombre ?? "Desconocido",
    asignado_nombre: row.asignado?.nombre ?? null,
    adjuntos_count: row.comunicacion_adjuntos?.[0]?.count ?? 0,
  }
}

// ===================================================
// Lectura
// ===================================================

/**
 * Lista de comunicaciones. El admin ve todas (con filtros); el resto, sólo
 * las propias (RLS lo garantiza igual).
 */
export async function getComunicaciones(
  filters?: ComunicacionFilters
): Promise<Result<ComunicacionConAutor[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("comunicaciones")
      .select(SELECT_COM)
      .order("created_at", { ascending: false })

    if (!isAdmin(profile.role)) {
      query = query.eq("creado_por", profile.id)
    } else {
      if (filters?.estado) query = query.eq("estado", filters.estado)
      if (filters?.categoria) query = query.eq("categoria", filters.categoria)
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows = ((data ?? []) as any[]).map(mapComunicacion)
    if (filters?.search?.trim()) {
      const q = filters.search.toLowerCase()
      rows = rows.filter(
        (c) =>
          c.titulo.toLowerCase().includes(q) ||
          c.cuerpo.toLowerCase().includes(q) ||
          String(c.numero).includes(q)
      )
    }
    return { data: rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando comunicaciones" }
  }
}

export async function getComunicacion(id: string): Promise<Result<ComunicacionDetalle>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: row, error } = await supabase
      .from("comunicaciones")
      .select(SELECT_COM)
      .eq("id", id)
      .single()

    if (error || !row) return { error: error?.message ?? "Comunicación no encontrada" }

    const [{ data: adjs }, { data: coms }, { data: hist }] = await Promise.all([
      supabase.from("comunicacion_adjuntos").select("*").eq("comunicacion_id", id).order("created_at"),
      supabase
        .from("comunicacion_comentarios")
        .select("*, autor_p:profiles!comunicacion_comentarios_autor_fkey(nombre)")
        .eq("comunicacion_id", id)
        .order("created_at"),
      supabase.from("comunicacion_historial").select("*").eq("comunicacion_id", id).order("changed_at"),
    ])

    const adjuntos = ((adjs ?? []) as ComunicacionAdjunto[]).map((a) => {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path)
      return { ...a, url: pub.publicUrl }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comentarios = ((coms ?? []) as any[]).map((c) => ({
      id: c.id,
      comunicacion_id: c.comunicacion_id,
      texto: c.texto,
      interno: c.interno,
      autor: c.autor,
      created_at: c.created_at,
      autor_nombre: c.autor_p?.nombre ?? "—",
    }))

    const detalle: ComunicacionDetalle = {
      ...mapComunicacion(row),
      adjuntos,
      comentarios,
      historial: (hist ?? []) as ComunicacionHistorial[],
    }
    return { data: detalle }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando comunicación" }
  }
}

// ===================================================
// Crear (cualquier usuario autenticado).
// Los adjuntos se suben desde el cliente al bucket y se insertan luego.
// ===================================================

export async function createComunicacion(
  input: ComunicacionInput
): Promise<Result<{ id: string; numero: number }>> {
  try {
    const profile = await requireAuth()
    if (!input.titulo?.trim()) return { error: "El asunto es obligatorio." }
    if (!input.cuerpo?.trim()) return { error: "El mensaje es obligatorio." }

    const supabase = await createClient()
    const { data: inserted, error } = await supabase
      .from("comunicaciones")
      .insert({
        titulo: input.titulo.trim(),
        cuerpo: input.cuerpo.trim(),
        categoria: input.categoria,
        prioridad: input.prioridad,
        creado_por: profile.id,
      })
      .select("id, numero")
      .single()

    if (error || !inserted) return { error: error?.message ?? "No se pudo enviar la comunicación." }

    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { data: { id: inserted.id as string, numero: inserted.numero as number } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error enviando comunicación" }
  }
}

// ===================================================
// Gestión (sólo admin)
// ===================================================

export async function cambiarEstadoComunicacion(
  id: string,
  estado: ComunicacionEstado
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "Sólo un admin puede gestionar comunicaciones." }
    const supabase = await createClient()
    const { error } = await supabase.from("comunicaciones").update({ estado }).eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(`${LIST_PATH}/${id}`)
    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cambiando estado" }
  }
}

export async function asignarComunicacion(
  id: string,
  asignadoA: string | null
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "Sólo un admin puede asignar." }
    const supabase = await createClient()

    const { data: actual } = await supabase
      .from("comunicaciones")
      .select("estado")
      .eq("id", id)
      .single()

    const patch: { asignado_a: string | null; estado?: ComunicacionEstado } = { asignado_a: asignadoA }
    if (asignadoA && actual && actual.estado === "abierta") {
      patch.estado = "en_revision"
    }

    const { error } = await supabase.from("comunicaciones").update(patch).eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(`${LIST_PATH}/${id}`)
    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error asignando" }
  }
}

export async function addComentarioComunicacion(
  comunicacionId: string,
  texto: string,
  interno: boolean
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!texto?.trim()) return { error: "El comentario está vacío." }
    const esInterno = interno && isAdmin(profile.role)

    const supabase = await createClient()
    const { error } = await supabase.from("comunicacion_comentarios").insert({
      comunicacion_id: comunicacionId,
      texto: texto.trim(),
      interno: esInterno,
      autor: profile.id,
    })
    if (error) return { error: error.message }
    revalidatePath(`${LIST_PATH}/${comunicacionId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error agregando comentario" }
  }
}

export async function deleteComunicacion(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "Sólo un admin puede eliminar comunicaciones." }
    const supabase = await createClient()

    const { data: adjs } = await supabase
      .from("comunicacion_adjuntos")
      .select("storage_path")
      .eq("comunicacion_id", id)
    const paths = ((adjs ?? []) as { storage_path: string }[]).map((a) => a.storage_path)
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)

    const { error } = await supabase.from("comunicaciones").delete().eq("id", id)
    if (error) return { error: error.message }
    revalidatePath(LIST_PATH)
    revalidatePath(ADMIN_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error eliminando comunicación" }
  }
}

/** Perfiles a los que se puede asignar la gestión (mandos / admin). */
export async function getAsignablesComunicaciones(): Promise<Result<{ id: string; nombre: string }[]>> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "No autorizado." }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nombre, role, active")
      .in("role", ["admin", "admin_rrhh", "supervisor"])
      .order("nombre")
    if (error) return { error: error.message }
    const rows = ((data ?? []) as { id: string; nombre: string; active: boolean | null }[])
      .filter((p) => p.active ?? true)
      .map((p) => ({ id: p.id, nombre: p.nombre }))
    return { data: rows }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando responsables" }
  }
}

// ===================================================
// Dashboard (sólo admin) — por estados
// ===================================================

export interface ComunicacionesDashboard {
  abiertas: number
  en_revision: number
  gestionadas: number
  cerradas: number
  tiempo_promedio_horas: number | null
  por_categoria: { categoria: ComunicacionCategoria; total: number }[]
  ultimas: ComunicacionConAutor[]
}

export async function getComunicacionesDashboard(): Promise<Result<ComunicacionesDashboard>> {
  try {
    const profile = await requireAuth()
    if (!isAdmin(profile.role)) return { error: "No autorizado." }
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("comunicaciones")
      .select(SELECT_COM)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coms = ((data ?? []) as any[]).map(mapComunicacion)

    const abiertas = coms.filter((c) => c.estado === "abierta").length
    const enRevision = coms.filter((c) => c.estado === "en_revision").length
    const gestionadas = coms.filter((c) => c.estado === "gestionada").length
    const cerradas = coms.filter((c) => c.estado === "cerrada").length

    const gestionadasConFecha = coms.filter((c) => c.gestionado_at)
    const tiempoPromedioHoras =
      gestionadasConFecha.length > 0
        ? Math.round(
            (gestionadasConFecha.reduce(
              (acc, c) =>
                acc +
                (new Date(c.gestionado_at as string).getTime() - new Date(c.created_at).getTime()),
              0
            ) /
              gestionadasConFecha.length /
              (1000 * 60 * 60)) *
              10
          ) / 10
        : null

    const catMap = new Map<ComunicacionCategoria, number>()
    for (const c of coms) catMap.set(c.categoria, (catMap.get(c.categoria) ?? 0) + 1)

    return {
      data: {
        abiertas,
        en_revision: enRevision,
        gestionadas,
        cerradas,
        tiempo_promedio_horas: tiempoPromedioHoras,
        por_categoria: Array.from(catMap.entries()).map(([categoria, total]) => ({ categoria, total })),
        ultimas: coms.slice(0, 8),
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando dashboard" }
  }
}

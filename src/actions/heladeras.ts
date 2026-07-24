"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  HeladeraAdjunto,
  HeladeraClienteLookup,
  HeladeraEstado,
  HeladeraMovimiento,
  HeladeraMovimientoConDetalle,
  HeladeraMovimientoInput,
  UploadedHeladeraFoto,
} from "@/types/heladeras"

const BUCKET = "heladeras"
const MIS_HELADERAS_PATH = "/mis-heladeras"
const GESTION_PATH = "/heladeras"

type Result<T> = { data: T } | { error: string }

// Quiénes pueden validar / observar un movimiento cargado por el chofer.
const ROLES_REVISION = ["admin", "supervisor", "admin_rrhh"]

// ===================================================
// Helpers
// ===================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adjuntoConUrl(supabase: any, a: HeladeraAdjunto) {
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path)
  return { ...a, url: pub.publicUrl as string }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enriquecer(supabase: any, rows: any[]): Promise<HeladeraMovimientoConDetalle[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)

  const { data: adjs } = await supabase
    .from("heladeras_movimientos_adjuntos")
    .select("*")
    .in("movimiento_id", ids)

  const adjsByMov = new Map<string, HeladeraAdjunto[]>()
  for (const a of (adjs ?? []) as HeladeraAdjunto[]) {
    const arr = adjsByMov.get(a.movimiento_id) ?? []
    arr.push(a)
    adjsByMov.set(a.movimiento_id, arr)
  }

  return rows.map((row) => ({
    ...(row as HeladeraMovimiento),
    autor_nombre: row.autor?.nombre ?? "Desconocido",
    adjuntos: (adjsByMov.get(row.id) ?? []).map((a) => adjuntoConUrl(supabase, a)),
  }))
}

// ===================================================
// Búsqueda del cliente por código
// ===================================================

/**
 * Trae el nombre del cliente a partir de su código. No hay maestro de clientes
 * en dpo-app: `bot_clientes_cache` es lo más parecido (2.2k clientes con
 * localidad) y `ventas_diarias_cliente` cubre a los que compraron hace poco.
 * Si no aparece en ninguna, el chofer escribe el nombre a mano.
 */
export async function buscarClientePorCodigo(
  codigo: number
): Promise<Result<HeladeraClienteLookup | null>> {
  try {
    await requireAuth()
    if (!Number.isFinite(codigo) || codigo <= 0) return { data: null }
    const supabase = await createClient()

    const { data: cache } = await supabase
      .from("bot_clientes_cache")
      .select("id_cliente, nombre_cliente, localidad")
      .eq("id_cliente", String(codigo))
      .maybeSingle()

    if (cache?.nombre_cliente) {
      return {
        data: {
          id_cliente: codigo,
          nombre_cliente: cache.nombre_cliente as string,
          localidad: (cache.localidad as string) ?? null,
        },
      }
    }

    const { data: venta } = await supabase
      .from("ventas_diarias_cliente")
      .select("id_cliente, nombre_cliente, fecha")
      .eq("id_cliente", codigo)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (venta?.nombre_cliente) {
      return {
        data: {
          id_cliente: codigo,
          nombre_cliente: venta.nombre_cliente as string,
          localidad: null,
        },
      }
    }

    return { data: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error buscando el cliente." }
  }
}

// ===================================================
// Crear (chofer)
// ===================================================

// Nota: las fotos se suben desde el cliente directo al bucket (evita el límite
// de body de Vercel en Server Actions). Acá sólo llegan los storage paths.
export async function createMovimientoHeladera(
  input: HeladeraMovimientoInput,
  fotos: UploadedHeladeraFoto[] = []
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    if (!input.fecha) return { error: "La fecha es obligatoria." }
    if (input.tipo !== "colocacion" && input.tipo !== "retiro") {
      return { error: "Elegí si llevaste o trajiste la heladera." }
    }
    const idCliente = Number(input.id_cliente)
    if (!Number.isFinite(idCliente) || idCliente <= 0) {
      return { error: "El código de cliente es obligatorio." }
    }

    // Autollenar nombre de chofer si el empleado tiene mapeo (informativo).
    const choferNombre = await resolverChoferNombre(supabase, profile.id)

    const { data: inserted, error } = await supabase
      .from("heladeras_movimientos")
      .insert({
        fecha: input.fecha,
        hora: input.hora || null,
        tipo: input.tipo,
        id_cliente: idCliente,
        nombre_cliente: input.nombre_cliente?.trim() || null,
        localidad: input.localidad?.trim() || null,
        cod_activo: input.cod_activo?.trim() || null,
        descripcion: input.descripcion?.trim() || null,
        patente: input.patente?.trim().toUpperCase() || null,
        chofer_nombre: choferNombre,
        observaciones: input.observaciones?.trim() || null,
        creado_por: profile.id,
      })
      .select("id")
      .single()

    if (error || !inserted) {
      return { error: error?.message ?? "No se pudo registrar el movimiento." }
    }
    const movimientoId = inserted.id as string

    if (fotos.length > 0) {
      const fotoRows = fotos.map((f) => ({
        movimiento_id: movimientoId,
        storage_path: f.storage_path,
        mime_type: f.mime_type,
        "tamaño_bytes": f.tamano_bytes,
        creado_por: profile.id,
      }))
      const { error: errFotos } = await supabase
        .from("heladeras_movimientos_adjuntos")
        .insert(fotoRows)
      if (errFotos) {
        await supabase.storage.from(BUCKET).remove(fotos.map((f) => f.storage_path))
        await supabase.from("heladeras_movimientos").delete().eq("id", movimientoId)
        return { error: `Error registrando las fotos: ${errFotos.message}` }
      }
    }

    revalidatePath(MIS_HELADERAS_PATH)
    revalidatePath(GESTION_PATH)
    return { data: { id: movimientoId } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error registrando el movimiento." }
  }
}

// ===================================================
// Lectura
// ===================================================

export async function getMisMovimientosHeladera(): Promise<Result<HeladeraMovimientoConDetalle[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("heladeras_movimientos")
      .select("*, autor:profiles!heladeras_movimientos_creado_por_fkey(id, nombre)")
      .eq("creado_por", profile.id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300)
    if (error) return { error: error.message }
    return { data: await enriquecer(supabase, (data ?? []) as unknown as Record<string, unknown>[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando tus movimientos." }
  }
}

/** Todos los movimientos de un rango — back-office (/heladeras). */
export async function getMovimientosHeladera(
  desde: string,
  hasta: string
): Promise<Result<HeladeraMovimientoConDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("heladeras_movimientos")
      .select("*, autor:profiles!heladeras_movimientos_creado_por_fkey(id, nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000)
    if (error) return { error: error.message }
    return { data: await enriquecer(supabase, (data ?? []) as unknown as Record<string, unknown>[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando los movimientos." }
  }
}

/** Historial de un cliente puntual (quién le dejó o le sacó la heladera). */
export async function getMovimientosHeladeraCliente(
  idCliente: number
): Promise<Result<HeladeraMovimientoConDetalle[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("heladeras_movimientos")
      .select("*, autor:profiles!heladeras_movimientos_creado_por_fkey(id, nombre)")
      .eq("id_cliente", idCliente)
      .order("fecha", { ascending: false })
    if (error) return { error: error.message }
    return { data: await enriquecer(supabase, (data ?? []) as unknown as Record<string, unknown>[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el historial." }
  }
}

// ===================================================
// Revisión (admin / supervisor)
// ===================================================

export async function revisarMovimientoHeladera(
  movimientoId: string,
  estado: HeladeraEstado,
  comentario?: string | null
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!ROLES_REVISION.includes(profile.role)) {
      return { error: "Sólo admin, supervisor o RRHH pueden revisar los movimientos." }
    }
    const supabase = await createClient()

    const { error } = await supabase
      .from("heladeras_movimientos")
      .update({
        estado,
        comentario_gestion: comentario?.trim() || null,
        revisado_por: profile.id,
        revisado_at: new Date().toISOString(),
      })
      .eq("id", movimientoId)
    if (error) return { error: error.message }

    revalidatePath(GESTION_PATH)
    revalidatePath(MIS_HELADERAS_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error actualizando el movimiento." }
  }
}

// ===================================================
// Borrar
// ===================================================

export async function deleteMovimientoHeladera(
  movimientoId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Sólo el autor o un admin pueden borrar.
    const { data: mov } = await supabase
      .from("heladeras_movimientos")
      .select("creado_por")
      .eq("id", movimientoId)
      .maybeSingle()
    if (!mov) return { error: "Movimiento no encontrado." }
    if (mov.creado_por !== profile.id && profile.role !== "admin") {
      return { error: "No tenés permiso para borrar este movimiento." }
    }

    const { data: adjs } = await supabase
      .from("heladeras_movimientos_adjuntos")
      .select("storage_path")
      .eq("movimiento_id", movimientoId)
    const paths = ((adjs ?? []) as { storage_path: string }[]).map((a) => a.storage_path)
    if (paths.length > 0) {
      await supabase.storage.from(BUCKET).remove(paths)
    }

    const { error } = await supabase.from("heladeras_movimientos").delete().eq("id", movimientoId)
    if (error) return { error: error.message }

    revalidatePath(MIS_HELADERAS_PATH)
    revalidatePath(GESTION_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error borrando el movimiento." }
  }
}

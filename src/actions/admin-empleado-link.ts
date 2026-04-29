"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/session"

// Local type — keeps Agent 1's src/types/database.ts untouched.
export type EmpleadoOption = {
  id: string
  nombre: string
  legajo: string | null
  sector: string | null
}

type EmpleadoRow = {
  id: string
  nombre: string
  legajo: number | null
  sector: string | null
}

function toOption(row: EmpleadoRow): EmpleadoOption {
  return {
    id: row.id,
    nombre: row.nombre,
    legajo: row.legajo !== null && row.legajo !== undefined ? String(row.legajo) : null,
    sector: row.sector ?? null,
  }
}

/**
 * List empleados not yet linked to any profile.
 * Used to populate the picker dropdown for linking a user.
 */
export async function getEmpleadosDisponibles(): Promise<
  { data: EmpleadoOption[] } | { error: string }
> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    // 1. Load already-linked empleado_ids from profiles.
    const { data: linked, error: linkedError } = await supabase
      .from("profiles")
      .select("empleado_id")
      .not("empleado_id", "is", null)

    if (linkedError) return { error: linkedError.message }

    const linkedIds = (linked ?? [])
      .map((r) => (r as { empleado_id: string | null }).empleado_id)
      .filter((id): id is string => !!id)

    // 2. Fetch active empleados, excluding the ones already linked.
    let query = supabase
      .from("empleados")
      .select("id, nombre, legajo, sector")
      .eq("activo", true)
      .order("nombre", { ascending: true })

    if (linkedIds.length > 0) {
      query = query.not("id", "in", `(${linkedIds.join(",")})`)
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    const rows = (data ?? []) as EmpleadoRow[]
    return { data: rows.map(toOption) }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error loading empleados disponibles",
    }
  }
}

/**
 * Link an existing user (profile) to an empleado.
 * Fails if the empleado is already linked to another user.
 */
export async function linkUserToEmpleado(
  userId: string,
  empleadoId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])

    if (!userId || !empleadoId) {
      return { error: "userId y empleadoId son requeridos" }
    }

    const adminClient = createAdminClient()

    // Guard: empleado must exist.
    const { data: empleado, error: empError } = await adminClient
      .from("empleados")
      .select("id")
      .eq("id", empleadoId)
      .maybeSingle()

    if (empError) return { error: empError.message }
    if (!empleado) return { error: "El empleado no existe" }

    // Guard: empleado not already linked to another user.
    const { data: existing, error: existingError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("empleado_id", empleadoId)
      .neq("id", userId)
      .maybeSingle()

    if (existingError) return { error: existingError.message }
    if (existing) {
      return { error: "Este empleado ya está vinculado a otro usuario" }
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ empleado_id: empleadoId })
      .eq("id", userId)

    if (updateError) return { error: updateError.message }

    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error linking user to empleado",
    }
  }
}

/**
 * Unlink a user from its current empleado (sets empleado_id to null).
 */
export async function unlinkUserFromEmpleado(
  userId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])

    if (!userId) return { error: "userId es requerido" }

    const adminClient = createAdminClient()

    const { error } = await adminClient
      .from("profiles")
      .update({ empleado_id: null })
      .eq("id", userId)

    if (error) return { error: error.message }

    return { ok: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error unlinking user from empleado",
    }
  }
}

export const EMPLEADO_SECTORES = ["Distribución", "Depósito", "Sin asignar"] as const
export type EmpleadoSector = (typeof EMPLEADO_SECTORES)[number]

export async function updateEmpleadoSector(
  empleadoId: string,
  sector: EmpleadoSector
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])

    if (!empleadoId) return { error: "empleadoId es requerido" }
    if (!EMPLEADO_SECTORES.includes(sector)) {
      return { error: "Sector inválido" }
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from("empleados")
      .update({ sector })
      .eq("id", empleadoId)

    if (error) return { error: error.message }
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando sector",
    }
  }
}

/**
 * Get the empleado currently linked to a user. Returns null if none.
 */
export async function getUserEmpleado(
  userId: string
): Promise<{ data: EmpleadoOption | null } | { error: string }> {
  try {
    await requireRole(["admin"])

    if (!userId) return { error: "userId es requerido" }

    const supabase = await createClient()

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("empleado_id")
      .eq("id", userId)
      .maybeSingle()

    if (profileError) return { error: profileError.message }

    const empleadoId = (profile as { empleado_id: string | null } | null)
      ?.empleado_id

    if (!empleadoId) return { data: null }

    const { data: empleado, error: empError } = await supabase
      .from("empleados")
      .select("id, nombre, legajo, sector")
      .eq("id", empleadoId)
      .maybeSingle()

    if (empError) return { error: empError.message }
    if (!empleado) return { data: null }

    return { data: toOption(empleado as EmpleadoRow) }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading user empleado",
    }
  }
}

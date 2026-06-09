import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Profile, UserRole } from "@/types/database"

/**
 * Get the current user's profile. Returns null SÓLO si no hay usuario
 * autenticado. Si el usuario está autenticado pero la lectura del perfil
 * falla de forma transitoria (hiccup de PostgREST / pool saturado), reintenta
 * una vez y, si persiste, lanza un error en lugar de devolver null. Devolver
 * null en ese caso haría que `requireAuth` redirija a /login y deslogueara a
 * un usuario que SÍ tiene sesión válida.
 *
 * Envuelto en `cache()` para deduplicar el `getUser()` + lectura de perfil a
 * UNA sola vez por request (layout + page + server actions comparten el
 * resultado), evitando llamadas concurrentes de auth en el mismo render.
 */
export const getProfile = cache(async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    // Reintento ante un fallo transitorio de lectura.
    ;({ data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle())
  }

  if (error) {
    // Usuario autenticado pero no se pudo leer el perfil: NO desloguear.
    throw new Error(`No se pudo leer el perfil del usuario: ${error.message}`)
  }

  return profile as Profile | null
})

/**
 * Require authentication. Redirects to /login if not authenticated.
 * Returns the user's profile.
 */
export async function requireAuth(): Promise<Profile> {
  const profile = await getProfile()

  if (!profile) {
    redirect("/login")
  }

  return profile
}

/**
 * Require one of the specified roles. Redirects to /login if not authenticated,
 * or to / if authenticated but lacking the required role.
 */
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await requireAuth()

  if (!roles.includes(profile.role)) {
    redirect("/")
  }

  return profile
}

/**
 * Devuelve el `empleado_id` del usuario autenticado (NULL si su profile no
 * está linkeado a un empleado). Para módulos de RRHH donde la lógica vive
 * a nivel de empleado, no de profile.
 */
export async function getEmpleadoIdFromAuth(): Promise<string | null> {
  const profile = await getProfile()
  if (!profile) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("empleado_id")
    .eq("id", profile.id)
    .single()

  return (data?.empleado_id as string | null) ?? null
}

/**
 * Asegura que el usuario es supervisor directo del empleado dado, o admin/admin_rrhh.
 * Devuelve el profile o redirige a / si no tiene permiso.
 */
export async function requireSupervisorOf(empleadoId: string): Promise<Profile> {
  const profile = await requireAuth()
  if (profile.role === "admin" || profile.role === "admin_rrhh") return profile

  if (profile.role !== "supervisor") {
    redirect("/")
  }

  const supabase = await createClient()
  const miEmpleadoId = await getEmpleadoIdFromAuth()
  if (!miEmpleadoId) redirect("/")

  const { data: target } = await supabase
    .from("empleados")
    .select("supervisor_id")
    .eq("id", empleadoId)
    .single()

  if (target?.supervisor_id !== miEmpleadoId) {
    redirect("/")
  }

  return profile
}

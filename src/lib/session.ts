import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Profile, UserRole } from "@/types/database"

/**
 * Get the current user's profile. Returns null if not authenticated.
 *
 * Memoizado por request con `cache()` de React: una pantalla como
 * /reuniones/[id] encadena ~10 acciones y cada una revalidaba el usuario por
 * su cuenta (auth.getUser + select a profiles = 2 round-trips a Supabase, que
 * está en otra región). Ahora el primer llamado paga y el resto lo reusa.
 */
export const getProfile = cache(async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const userId = await getUserId(supabase)
  if (!userId) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single()

  return profile as Profile | null
})

/**
 * Devuelve el id del usuario autenticado validando el access token SIN pegarle
 * al servidor de Auth.
 *
 * El proyecto firma los JWT con clave asimétrica (ES256, ver
 * `/auth/v1/.well-known/jwks.json`), así que `getClaims()` verifica la firma
 * localmente con WebCrypto y cachea el JWKS. `getUser()`, en cambio, hacía un
 * round-trip HTTP a Auth por cada llamada, y cada uno de esos round-trips
 * dispara cinco SELECT en la base (users, sessions, mfa_amr_claims, identities
 * y mfa_factors).
 *
 * Medido en `pg_stat_statements` antes del cambio: ~1.3 millones de llamadas a
 * cada uno de esos SELECT y ~45 minutos de CPU de la base acumulados sólo para
 * responder "quién sos". Era el mayor consumidor de la base, por encima de
 * cualquier query del negocio.
 *
 * Se mantiene el fallback a `getUser()` porque `getClaims()` también pega a la
 * red cuando el token está por vencer (refresca antes de validar) o cuando no
 * hay WebCrypto, y porque una falla de red NO es una sesión inválida: un 504 o
 * un ECONNRESET tienen que reintentarse, mientras que un 401/403 es un "no" de
 * verdad y se respeta al toque. Mismo criterio que el middleware.
 */
async function getUserId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (!error && data?.claims?.sub) return data.claims.sub
    // Rechazo explícito: la sesión no vale, no hay nada que reintentar.
    if (error && (error.status === 401 || error.status === 403)) return null
  } catch {
    // Firma ilegible, JWKS inalcanzable o WebCrypto ausente: probamos por red.
  }

  let { data: userData, error } = await supabase.auth.getUser()

  if (error && error.status !== 401 && error.status !== 403) {
    await new Promise((r) => setTimeout(r, 300))
    ;({ data: userData, error } = await supabase.auth.getUser())
  }

  return userData?.user?.id ?? null
}

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

  // `getProfile()` ya hizo `select("*")`: `empleado_id` viene en esa fila y el
  // segundo SELECT a profiles era un round-trip de más por cada llamada.
  return profile.empleado_id ?? null
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

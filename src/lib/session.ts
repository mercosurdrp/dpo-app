import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Profile, UserRole } from "@/types/database"

/**
 * Get the current user's profile. Returns null if not authenticated.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  return profile as Profile | null
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

"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/session"
import type { Profile, UserRole, UserWithStats } from "@/types/database"

export async function getUsers(): Promise<
  { data: Profile[] } | { error: string }
> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    return { data: data as Profile[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading users" }
  }
}

export async function createUser(data: {
  email: string
  password: string
  nombre: string
  role: string
}): Promise<{ data: Profile } | { error: string }> {
  try {
    await requireRole(["admin"])
    const adminClient = createAdminClient()

    // Create auth user with service role
    const { data: authUser, error: authError } =
      await adminClient.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { nombre: data.nombre },
      })

    if (authError) return { error: authError.message }
    if (!authUser.user) return { error: "Failed to create user" }

    // Update profile with role and nombre
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .update({ role: data.role, nombre: data.nombre })
      .eq("id", authUser.user.id)
      .select()
      .single()

    if (profileError) {
      // Profile might not exist yet if trigger hasn't fired; insert instead
      const { data: inserted, error: insertError } = await adminClient
        .from("profiles")
        .upsert({
          id: authUser.user.id,
          email: data.email,
          nombre: data.nombre,
          role: data.role,
          active: true,
        })
        .select()
        .single()

      if (insertError) return { error: insertError.message }
      return { data: inserted as Profile }
    }

    return { data: profile as Profile }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating user" }
  }
}

export async function updateUserRole(
  userId: string,
  role: string
): Promise<{ data: Profile } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as Profile }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating user role" }
  }
}

export async function toggleUserActive(
  userId: string
): Promise<{ data: Profile } | { error: string }> {
  try {
    await requireRole(["admin"])
    const supabase = await createClient()

    // Get current state
    const { data: current, error: getError } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", userId)
      .single()

    if (getError) return { error: getError.message }

    const newActive = !(current as { active: boolean }).active

    const { data, error } = await supabase
      .from("profiles")
      .update({ active: newActive })
      .eq("id", userId)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as Profile }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error toggling user active status" }
  }
}

/**
 * Hard delete: removes from auth.users. Migration 001 defines
 * profiles.id FK to auth.users(id) with ON DELETE CASCADE, so the
 * profiles row is removed automatically by the database.
 * Refuses to delete the currently logged-in user.
 */
export async function deleteUser(
  userId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])

    // Guard: no self-delete
    const supabase = await createClient()
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser()

    if (currentUser && currentUser.id === userId) {
      return { error: "No podés eliminarte a vos mismo" }
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) return { error: error.message }

    // profiles row is removed by ON DELETE CASCADE (migration 001)
    return { ok: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando usuario",
    }
  }
}

/**
 * Partial update of profile fields. If `email` is provided, it's also
 * updated in auth.users via admin.updateUserById. If the auth update
 * fails, the profile is NOT touched.
 */
export async function updateUser(
  userId: string,
  data: { nombre?: string; email?: string; role?: UserRole }
): Promise<{ data: Profile } | { error: string }> {
  try {
    await requireRole(["admin"])
    const adminClient = createAdminClient()

    // If email changes, update auth.users first
    if (data.email !== undefined) {
      const { error: authError } =
        await adminClient.auth.admin.updateUserById(userId, {
          email: data.email,
        })
      if (authError) return { error: authError.message }
    }

    // Build partial update payload
    const updatePayload: Record<string, string> = {}
    if (data.nombre !== undefined) updatePayload.nombre = data.nombre
    if (data.email !== undefined) updatePayload.email = data.email
    if (data.role !== undefined) updatePayload.role = data.role

    if (Object.keys(updatePayload).length === 0) {
      // Nothing to change in the profile — fetch current row and return it
      const { data: current, error: fetchError } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (fetchError) return { error: fetchError.message }
      return { data: current as Profile }
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)
      .select()
      .single()

    if (profileError) return { error: profileError.message }
    return { data: profile as Profile }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando usuario",
    }
  }
}

/**
 * Admin sets a new password for a user. Minimum 6 chars.
 */
export async function resetUserPassword(
  userId: string,
  newPassword: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireRole(["admin"])

    if (!newPassword || newPassword.length < 6) {
      return { error: "La contraseña debe tener al menos 6 caracteres" }
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (error) return { error: error.message }
    return { ok: true }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error reseteando contraseña",
    }
  }
}

/**
 * Enhanced getter: same as getUsers but joins auth.users for
 * last_sign_in_at + email_confirmed_at. Uses adminClient.auth.admin.listUsers()
 * (first page, per_page default 50).
 *
 * TODO: paginate if the team grows beyond 50 users.
 */
export async function getUsersWithStats(): Promise<
  { data: UserWithStats[] } | { error: string }
> {
  try {
    await requireRole(["admin"])
    const adminClient = createAdminClient()

    // Fetch profiles
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })

    if (profilesError) return { error: profilesError.message }

    // Fetch auth.users (first page)
    const { data: authList, error: authError } =
      await adminClient.auth.admin.listUsers()

    if (authError) return { error: authError.message }

    const authById = new Map<
      string,
      { last_sign_in_at: string | null; email_confirmed_at: string | null }
    >()
    for (const u of authList.users) {
      authById.set(u.id, {
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
      })
    }

    const merged: UserWithStats[] = (profiles as Profile[]).map((p) => {
      const auth = authById.get(p.id)
      return {
        ...p,
        last_sign_in_at: auth?.last_sign_in_at ?? null,
        email_confirmed_at: auth?.email_confirmed_at ?? null,
      }
    })

    return { data: merged }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando usuarios",
    }
  }
}

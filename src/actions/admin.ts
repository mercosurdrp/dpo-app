"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireRole } from "@/lib/session"
import type { Profile } from "@/types/database"

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

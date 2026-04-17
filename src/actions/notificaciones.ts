"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { Notificacion } from "@/types/database"

type Result<T> = { data: T } | { error: string }

export async function getMisNotificaciones(): Promise<Result<Notificacion[]>> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("notificaciones")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) return { error: error.message }
    return { data: (data ?? []) as Notificacion[] }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando notificaciones",
    }
  }
}

export async function marcarLeida(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("notificaciones")
      .update({ leida: true })
      .eq("id", id)
      .eq("user_id", profile.id)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error marcando notificación",
    }
  }
}

export async function marcarTodasLeidas(): Promise<
  { success: true } | { error: string }
> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("notificaciones")
      .update({ leida: true })
      .eq("user_id", profile.id)
      .eq("leida", false)

    if (error) return { error: error.message }
    revalidatePath("/")
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error marcando notificaciones",
    }
  }
}

export async function eliminarNotificacion(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase
      .from("notificaciones")
      .delete()
      .eq("id", id)
      .eq("user_id", profile.id)

    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error eliminando notificación",
    }
  }
}

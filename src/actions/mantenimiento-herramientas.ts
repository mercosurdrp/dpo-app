"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"

// Registro simple de herramientas de taller (pañol de mantenimiento de flota).
// Lectura para autenticados; alta/edición/baja solo admin/supervisor. Copia el
// estilo y los guards de las acciones de repuestos en mantenimiento-vehiculos.ts.

export interface Herramienta {
  id: string
  nombre: string
  cantidad: number
  estado: string | null
  ubicacion: string | null
  notas: string | null
  created_at: string
}

export async function getHerramientas(): Promise<
  { data: Herramienta[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_herramientas")
      .select("*")
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data || []) as Herramienta[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function upsertHerramienta(input: {
  id?: string
  nombre: string
  cantidad?: number | null
  estado?: string
  ubicacion?: string
  notas?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.nombre.trim()) return { error: "Ingresá el nombre de la herramienta" }
    const supabase = await createClient()
    const row = {
      nombre: input.nombre.trim(),
      cantidad: input.cantidad != null && input.cantidad > 0 ? input.cantidad : 1,
      estado: input.estado?.trim() || null,
      ubicacion: input.ubicacion?.trim() || null,
      notas: input.notas?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = input.id
      ? await supabase.from("mantenimiento_herramientas").update(row).eq("id", input.id)
      : await supabase
          .from("mantenimiento_herramientas")
          .insert({ ...row, created_by: profile.id })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteHerramienta(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_herramientas")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

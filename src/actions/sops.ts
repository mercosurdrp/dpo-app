"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type { Sop, SopVersion, SopConVersiones } from "@/types/database"

// ---------- getSopsByPilar ----------

export async function getSopsByPilar(
  pilarId: string
): Promise<{ data: SopConVersiones[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: sops, error } = await supabase
      .from("sops")
      .select("*")
      .eq("pilar_id", pilarId)
      .order("nombre")

    if (error) return { error: error.message }

    const items: SopConVersiones[] = []

    for (const sop of (sops ?? []) as Sop[]) {
      const { data: versiones } = await supabase
        .from("sop_versiones")
        .select("*")
        .eq("sop_id", sop.id)
        .order("version", { ascending: false })

      const { data: profile } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("id", sop.uploaded_by)
        .single()

      items.push({
        ...sop,
        versiones: (versiones ?? []) as SopVersion[],
        uploaded_by_nombre: profile?.nombre ?? "Usuario",
      })
    }

    return { data: items }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading SOPs" }
  }
}

// ---------- createSop ----------

export async function createSop(data: {
  pilar_id: string
  nombre: string
  descripcion?: string
  file_path: string
  file_name: string
  file_type: string
  file_size: number
}): Promise<{ data: Sop } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: sop, error } = await supabase
      .from("sops")
      .insert({
        pilar_id: data.pilar_id,
        nombre: data.nombre,
        descripcion: data.descripcion ?? null,
        file_path: data.file_path,
        file_name: data.file_name,
        file_type: data.file_type,
        file_size: data.file_size,
        version: 1,
        uploaded_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    // Save first version
    await supabase.from("sop_versiones").insert({
      sop_id: sop.id,
      version: 1,
      file_path: data.file_path,
      file_name: data.file_name,
      file_size: data.file_size,
      notas: "Version inicial",
      uploaded_by: profile.id,
    })

    return { data: sop as Sop }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating SOP" }
  }
}

// ---------- updateSopVersion (new version upload) ----------

export async function updateSopVersion(data: {
  sop_id: string
  file_path: string
  file_name: string
  file_type: string
  file_size: number
  notas?: string
}): Promise<{ data: Sop } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    // Get current version
    const { data: current, error: getErr } = await supabase
      .from("sops")
      .select("version")
      .eq("id", data.sop_id)
      .single()

    if (getErr || !current) {
      return { error: getErr?.message ?? "SOP no encontrado" }
    }

    const newVersion = current.version + 1

    // Update SOP
    const { data: sop, error: updateErr } = await supabase
      .from("sops")
      .update({
        file_path: data.file_path,
        file_name: data.file_name,
        file_type: data.file_type,
        file_size: data.file_size,
        version: newVersion,
      })
      .eq("id", data.sop_id)
      .select()
      .single()

    if (updateErr) return { error: updateErr.message }

    // Save version history
    await supabase.from("sop_versiones").insert({
      sop_id: data.sop_id,
      version: newVersion,
      file_path: data.file_path,
      file_name: data.file_name,
      file_size: data.file_size,
      notas: data.notas ?? null,
      uploaded_by: profile.id,
    })

    return { data: sop as Sop }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating SOP" }
  }
}

// ---------- updateSopInfo ----------

export async function updateSopInfo(
  id: string,
  data: { nombre?: string; descripcion?: string }
): Promise<{ data: Sop } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: sop, error } = await supabase
      .from("sops")
      .update(data)
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: sop as Sop }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating SOP" }
  }
}

// ---------- deleteSop ----------

export async function deleteSop(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("sops").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting SOP" }
  }
}

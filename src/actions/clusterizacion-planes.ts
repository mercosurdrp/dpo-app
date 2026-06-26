"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/session"

/** Un plan de acción puntual creado sobre un cliente desde la Clusterización. */
export interface ClusterPlan {
  id: string
  id_cliente: number
  nombre_cliente: string | null
  cluster: string | null
  estado_cliente: string | null
  salud_cliente: string | null
  descripcion: string
  responsable: string | null
  fecha_limite: string | null
  estado: string
  created_at: string
}

export async function crearPlanCluster(input: {
  id_cliente: number
  nombre_cliente?: string | null
  cluster?: string | null
  estado_cliente?: string | null
  salud_cliente?: string | null
  descripcion: string
  responsable?: string | null
  fecha_limite?: string | null
}): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }

  const supabase = await createClient()
  const { error } = await supabase.from("cluster_planes").insert({
    id_cliente: input.id_cliente,
    nombre_cliente: input.nombre_cliente ?? null,
    cluster: input.cluster ?? null,
    estado_cliente: input.estado_cliente ?? null,
    salud_cliente: input.salud_cliente ?? null,
    descripcion: input.descripcion.trim(),
    responsable: input.responsable?.trim() || null,
    fecha_limite: input.fecha_limite || null,
    created_by: profile.id,
  })
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

export async function getPlanesCluster(): Promise<ClusterPlan[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("cluster_planes")
    .select(
      "id, id_cliente, nombre_cliente, cluster, estado_cliente, salud_cliente, descripcion, responsable, fecha_limite, estado, created_at",
    )
    .order("created_at", { ascending: false })
  return (data ?? []) as ClusterPlan[]
}

export async function actualizarEstadoPlanCluster(
  id: string,
  estado: string,
): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  if (!["pendiente", "en_proceso", "hecho"].includes(estado))
    return { error: "Estado inválido." }
  const supabase = await createClient()
  const { error } = await supabase.from("cluster_planes").update({ estado }).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

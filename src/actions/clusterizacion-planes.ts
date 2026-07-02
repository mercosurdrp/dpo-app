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

// ── Plan AGRUPADO por cubo (uno por cubo, se reemplaza) ──────────────────────

/** Plan de acción que aplica a TODOS los PDV de un cubo del diagrama 3D. */
export interface ClusterPlanCubo {
  cubo: string
  descripcion: string
  responsable: string | null
  fecha_limite: string | null
  estado: string
  updated_at: string
}

export async function getPlanesCubo(): Promise<ClusterPlanCubo[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("cluster_planes_cubo")
    .select("cubo, descripcion, responsable, fecha_limite, estado, updated_at")
  return (data ?? []) as ClusterPlanCubo[]
}

export async function guardarPlanCubo(input: {
  cubo: string
  descripcion: string
  responsable?: string | null
  fecha_limite?: string | null
}): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  if (!input.cubo) return { error: "Falta el cubo." }
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }

  const supabase = await createClient()
  // Upsert por `cubo`: si ya existe, reemplaza descripción/responsable/límite.
  // No se incluye `estado` para no pisarlo al editar (en alta usa el default).
  const { error } = await supabase.from("cluster_planes_cubo").upsert(
    {
      cubo: input.cubo,
      descripcion: input.descripcion.trim(),
      responsable: input.responsable?.trim() || null,
      fecha_limite: input.fecha_limite || null,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cubo" },
  )
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

export async function actualizarEstadoPlanCubo(
  cubo: string,
  estado: string,
): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  if (!["pendiente", "en_proceso", "hecho"].includes(estado))
    return { error: "Estado inválido." }
  const supabase = await createClient()
  const { error } = await supabase.from("cluster_planes_cubo").update({ estado }).eq("cubo", cubo)
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

export async function eliminarPlanCubo(cubo: string): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  const supabase = await createClient()
  const { error } = await supabase.from("cluster_planes_cubo").delete().eq("cubo", cubo)
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

// ── Plan AGRUPADO por frente estratégico (cruce cubos × Censo Thomas) ─────────

/** Plan de acción que aplica a TODOS los PDV de un frente de la solapa Mercado. */
export interface ClusterPlanFrente {
  frente: string
  descripcion: string
  responsable: string | null
  fecha_limite: string | null
  estado: string
  updated_at: string
}

export async function getPlanesFrente(): Promise<ClusterPlanFrente[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("cluster_planes_frente")
    .select("frente, descripcion, responsable, fecha_limite, estado, updated_at")
  return (data ?? []) as ClusterPlanFrente[]
}

export async function guardarPlanFrente(input: {
  frente: string
  descripcion: string
  responsable?: string | null
  fecha_limite?: string | null
}): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  if (!input.frente) return { error: "Falta el frente." }
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }

  const supabase = await createClient()
  // Upsert por `frente`: si ya existe, reemplaza descripción/responsable/límite.
  // No se incluye `estado` para no pisarlo al editar (en alta usa el default).
  const { error } = await supabase.from("cluster_planes_frente").upsert(
    {
      frente: input.frente,
      descripcion: input.descripcion.trim(),
      responsable: input.responsable?.trim() || null,
      fecha_limite: input.fecha_limite || null,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "frente" },
  )
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

export async function actualizarEstadoPlanFrente(
  frente: string,
  estado: string,
): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: "No autenticado." }
  if (!["pendiente", "en_proceso", "hecho"].includes(estado))
    return { error: "Estado inválido." }
  const supabase = await createClient()
  const { error } = await supabase
    .from("cluster_planes_frente")
    .update({ estado })
    .eq("frente", frente)
  if (error) return { error: error.message }
  revalidatePath("/planeamiento/clusterizacion")
  return { ok: true }
}

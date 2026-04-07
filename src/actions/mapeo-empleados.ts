"use server"

import { createClient } from "@/lib/supabase/server"
import type { EmpleadoCompleto } from "@/types/database"

// ---------- Queries ----------

export async function getMapeosCompleto(): Promise<
  { data: EmpleadoCompleto[] } | { error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("vista_empleado_completo")
    .select("*")
    .order("legajo")

  if (error) return { error: error.message }
  return { data: (data ?? []) as EmpleadoCompleto[] }
}

export async function getUnmappedChoferes(): Promise<
  { data: { id: string; nombre: string }[] } | { error: string }
> {
  const supabase = await createClient()

  // Choferes activos que no están en mapeo
  const { data, error } = await supabase.rpc("get_unmapped_choferes")

  if (error) {
    // Fallback: query manual si el RPC no existe
    const { data: choferes } = await supabase
      .from("catalogo_choferes")
      .select("id, nombre")
      .eq("active", true)
      .order("nombre")

    const { data: mapeados } = await supabase
      .from("mapeo_empleado_chofer")
      .select("nombre_chofer")

    const nombresMap = new Set((mapeados ?? []).map((m) => m.nombre_chofer))
    const unmapped = (choferes ?? []).filter((c) => !nombresMap.has(c.nombre))
    return { data: unmapped }
  }

  return { data: data ?? [] }
}

export async function getUnmappedFleteros(): Promise<
  { data: string[] } | { error: string }
> {
  const supabase = await createClient()

  // Patentes distintas en rechazos que no están en mapeo
  const { data: fleteros } = await supabase
    .from("rechazos")
    .select("ds_fletero_carga")
    .not("ds_fletero_carga", "is", null)

  const { data: mapeados } = await supabase
    .from("mapeo_empleado_fletero")
    .select("ds_fletero_carga")

  const mapeadosSet = new Set((mapeados ?? []).map((m) => m.ds_fletero_carga))
  const uniqueFleteros = [
    ...new Set((fleteros ?? []).map((f) => f.ds_fletero_carga).filter(Boolean)),
  ].filter((f) => !mapeadosSet.has(f))

  uniqueFleteros.sort()
  return { data: uniqueFleteros }
}

// ---------- Mutations ----------

export async function upsertMapeoChofer(
  empleadoId: string,
  nombreChofer: string,
  notas?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("mapeo_empleado_chofer").upsert(
    {
      empleado_id: empleadoId,
      nombre_chofer: nombreChofer,
      notas: notas ?? null,
    },
    { onConflict: "nombre_chofer" }
  )
  if (error) return { error: error.message }
  return { success: true }
}

export async function upsertMapeoFletero(
  empleadoId: string,
  dsFletero: string,
  idFletero?: number,
  notas?: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("mapeo_empleado_fletero").upsert(
    {
      empleado_id: empleadoId,
      ds_fletero_carga: dsFletero,
      id_fletero_carga: idFletero ?? null,
      notas: notas ?? null,
    },
    { onConflict: "ds_fletero_carga" }
  )
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteMapeoChofer(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("mapeo_empleado_chofer")
    .delete()
    .eq("id", id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteMapeoFletero(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("mapeo_empleado_fletero")
    .delete()
    .eq("id", id)
  if (error) return { error: error.message }
  return { success: true }
}

// ---------- Empleados list (for dropdowns) ----------

export async function getEmpleadosActivos(): Promise<
  { data: { id: string; legajo: number; nombre: string; sector: string }[] } | { error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, sector")
    .eq("activo", true)
    .order("nombre")

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

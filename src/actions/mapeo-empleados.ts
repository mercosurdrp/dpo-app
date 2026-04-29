"use server"

import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import type { EmpleadoCompleto } from "@/types/database"
import {
  SECTORES_EMPLEADO,
  type EmpleadoInput,
  type SectorEmpleado,
} from "./mapeo-empleados.types"

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
  {
    data: {
      id: string
      legajo: number
      nombre: string
      sector: string
      numero_id: string
      activo: boolean
    }[]
  } | { error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, sector, numero_id, activo")
    .eq("activo", true)
    .order("nombre")

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function getEmpleadosTodos(): Promise<
  {
    data: {
      id: string
      legajo: number
      nombre: string
      sector: string
      numero_id: string
      activo: boolean
    }[]
  } | { error: string }
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, sector, numero_id, activo")
    .order("legajo")

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

// ---------- Empleados CRUD ----------

function validateEmpleadoInput(
  input: Partial<EmpleadoInput>
): { ok: true; value: EmpleadoInput } | { ok: false; error: string } {
  const legajo = Number(input.legajo)
  if (!Number.isInteger(legajo) || legajo <= 0) {
    return { ok: false, error: "Legajo debe ser un entero positivo" }
  }
  const nombre = (input.nombre ?? "").trim()
  if (!nombre) return { ok: false, error: "Nombre es obligatorio" }
  const numero_id = (input.numero_id ?? "").trim()
  if (!numero_id) return { ok: false, error: "Número de documento es obligatorio" }
  const sector = (input.sector ?? "Distribución") as SectorEmpleado
  if (!SECTORES_EMPLEADO.includes(sector)) {
    return { ok: false, error: "Sector inválido" }
  }
  const activo = input.activo === undefined ? true : !!input.activo
  return { ok: true, value: { legajo, nombre, numero_id, sector, activo } }
}

export async function createEmpleado(
  input: Partial<EmpleadoInput>
): Promise<{ data: { id: string } } | { error: string }> {
  try {
    await requireRole(["admin"])
    const validated = validateEmpleadoInput(input)
    if (!validated.ok) return { error: validated.error }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .insert(validated.value)
      .select("id")
      .single()
    if (error) {
      if (error.code === "23505") {
        return { error: `Ya existe un empleado con legajo ${validated.value.legajo}` }
      }
      return { error: error.message }
    }
    return { data: { id: data!.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando empleado",
    }
  }
}

export async function updateEmpleado(
  id: string,
  input: Partial<EmpleadoInput>
): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin"])
    if (!id) return { error: "ID requerido" }
    const validated = validateEmpleadoInput(input)
    if (!validated.ok) return { error: validated.error }
    const supabase = await createClient()
    const { error } = await supabase
      .from("empleados")
      .update(validated.value)
      .eq("id", id)
    if (error) {
      if (error.code === "23505") {
        return { error: `Ya existe otro empleado con legajo ${validated.value.legajo}` }
      }
      return { error: error.message }
    }
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando empleado",
    }
  }
}

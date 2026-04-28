"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole, getEmpleadoIdFromAuth } from "@/lib/session"
import type {
  Empleado,
  EmpleadoConSupervisor,
  TipoContrato,
} from "@/types/database"

const RRHH_PATH = "/rrhh/personal"

type Result<T> = { data: T } | { error: string }

interface EmpleadoFiltros {
  area?: string
  activo?: boolean
  supervisor_id?: string
  search?: string
}

interface EmpleadoInput {
  legajo: number
  nombre: string
  numero_id?: string | null
  sector?: string | null
  area?: string | null
  departamento?: string | null
  puesto?: string | null
  fecha_ingreso?: string | null
  tipo_contrato?: TipoContrato | null
  cuil?: string | null
  telefono?: string | null
  email_personal?: string | null
  supervisor_id?: string | null
  activo?: boolean
}

// ===================================================
// Listado con filtros (RLS define visibilidad por rol)
// ===================================================
export async function listarEmpleados(
  filtros?: EmpleadoFiltros
): Promise<Result<EmpleadoConSupervisor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("empleados")
      .select(
        `*, supervisor:empleados!empleados_supervisor_id_fkey(id, legajo, nombre)`
      )
      .order("nombre", { ascending: true })

    if (filtros?.area) query = query.eq("area", filtros.area)
    if (filtros?.activo !== undefined) query = query.eq("activo", filtros.activo)
    if (filtros?.supervisor_id) query = query.eq("supervisor_id", filtros.supervisor_id)
    if (filtros?.search) {
      query = query.ilike("nombre", `%${filtros.search}%`)
    }

    const { data, error } = await query
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: EmpleadoConSupervisor[] = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      profile_id: row.profile_id,
      legajo: row.legajo,
      nombre: row.nombre,
      numero_id: row.numero_id,
      sector: row.sector,
      activo: row.activo,
      created_at: row.created_at,
      updated_at: row.updated_at,
      supervisor_id: row.supervisor_id,
      area: row.area,
      departamento: row.departamento,
      puesto: row.puesto,
      fecha_ingreso: row.fecha_ingreso,
      tipo_contrato: row.tipo_contrato,
      cuil: row.cuil,
      telefono: row.telefono,
      email_personal: row.email_personal,
      supervisor_nombre: row.supervisor?.nombre ?? null,
      supervisor_legajo: row.supervisor?.legajo ?? null,
    }))

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando empleados",
    }
  }
}

// ===================================================
// Mi equipo (supervisor): empleados directos a mi cargo
// ===================================================
export async function listarMiEquipo(): Promise<Result<EmpleadoConSupervisor[]>> {
  try {
    const profile = await requireAuth()
    const miEmpleadoId = await getEmpleadoIdFromAuth()

    if (!miEmpleadoId && profile.role !== "admin" && profile.role !== "admin_rrhh") {
      return { data: [] }
    }
    if (!miEmpleadoId) return { data: [] }

    return listarEmpleados({ supervisor_id: miEmpleadoId })
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando equipo",
    }
  }
}

// ===================================================
// Crear empleado (admin / admin_rrhh)
// ===================================================
export async function crearEmpleado(
  input: EmpleadoInput
): Promise<Result<{ id: string }>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    if (!input.legajo || !input.nombre?.trim()) {
      return { error: "Legajo y nombre son obligatorios" }
    }

    const { data, error } = await supabase
      .from("empleados")
      .insert({
        legajo: input.legajo,
        nombre: input.nombre.trim(),
        numero_id: input.numero_id?.trim() || "",
        sector: input.sector?.trim() || "Distribución",
        area: input.area?.trim() || null,
        departamento: input.departamento?.trim() || null,
        puesto: input.puesto?.trim() || null,
        fecha_ingreso: input.fecha_ingreso || null,
        tipo_contrato: input.tipo_contrato || null,
        cuil: input.cuil?.trim() || null,
        telefono: input.telefono?.trim() || null,
        email_personal: input.email_personal?.trim() || null,
        supervisor_id: input.supervisor_id || null,
        activo: input.activo ?? true,
      })
      .select("id")
      .single()

    if (error) return { error: error.message }

    revalidatePath(RRHH_PATH)
    return { data: { id: data.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error creando empleado",
    }
  }
}

// ===================================================
// Actualizar empleado
// ===================================================
export async function actualizarEmpleado(
  id: string,
  input: Partial<EmpleadoInput>
): Promise<Result<{ id: string }>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    const update: Record<string, unknown> = {}
    if (input.legajo !== undefined) update.legajo = input.legajo
    if (input.nombre !== undefined) update.nombre = input.nombre.trim()
    if (input.numero_id !== undefined) update.numero_id = input.numero_id?.trim() || ""
    if (input.sector !== undefined) update.sector = input.sector?.trim() || null
    if (input.area !== undefined) update.area = input.area?.trim() || null
    if (input.departamento !== undefined) update.departamento = input.departamento?.trim() || null
    if (input.puesto !== undefined) update.puesto = input.puesto?.trim() || null
    if (input.fecha_ingreso !== undefined) update.fecha_ingreso = input.fecha_ingreso || null
    if (input.tipo_contrato !== undefined) update.tipo_contrato = input.tipo_contrato || null
    if (input.cuil !== undefined) update.cuil = input.cuil?.trim() || null
    if (input.telefono !== undefined) update.telefono = input.telefono?.trim() || null
    if (input.email_personal !== undefined) update.email_personal = input.email_personal?.trim() || null
    if (input.supervisor_id !== undefined) update.supervisor_id = input.supervisor_id || null
    if (input.activo !== undefined) update.activo = input.activo

    const { error } = await supabase.from("empleados").update(update).eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(RRHH_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error actualizando empleado",
    }
  }
}

// ===================================================
// Obtener jerarquía a partir de un supervisor (recursive)
// ===================================================
export async function obtenerJerarquia(
  supervisorId: string
): Promise<Result<{ raiz: Empleado; descendientes: Empleado[] }>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: raiz, error: errRaiz } = await supabase
      .from("empleados")
      .select("*")
      .eq("id", supervisorId)
      .single()

    if (errRaiz || !raiz) {
      return { error: errRaiz?.message ?? "Supervisor no encontrado" }
    }

    // BFS manual hasta 3 niveles para no recursar infinito si hay ciclos.
    const descendientes: Empleado[] = []
    const visitados = new Set<string>([supervisorId])
    let frontera = [supervisorId]

    for (let nivel = 0; nivel < 3 && frontera.length > 0; nivel++) {
      const { data: hijos, error } = await supabase
        .from("empleados")
        .select("*")
        .in("supervisor_id", frontera)

      if (error) return { error: error.message }
      const hijosArr = (hijos ?? []) as Empleado[]
      const nuevos = hijosArr.filter((h) => !visitados.has(h.id))
      descendientes.push(...nuevos)
      nuevos.forEach((h) => visitados.add(h.id))
      frontera = nuevos.map((h) => h.id)
    }

    return { data: { raiz: raiz as Empleado, descendientes } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando jerarquía",
    }
  }
}

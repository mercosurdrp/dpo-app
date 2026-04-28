"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole, getEmpleadoIdFromAuth } from "@/lib/session"
import type {
  RrhhSolicitudConDetalle,
  RrhhTipoLicencia,
  RrhhSaldoVacaciones,
} from "@/types/database"

const BUCKET = "rrhh-certificados"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

// ===================================================
// Catálogo de tipos de licencia
// ===================================================
export async function listarTiposLicencia(): Promise<Result<RrhhTipoLicencia[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_tipos_licencia")
      .select("*")
      .eq("activo", true)
      .order("nombre")
    if (error) return { error: error.message }
    return { data: (data ?? []) as RrhhTipoLicencia[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Saldo de vacaciones
// ===================================================
export async function obtenerSaldoVacaciones(
  empleadoId: string,
  anio: number
): Promise<Result<RrhhSaldoVacaciones | null>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_saldos_vacaciones")
      .select("*")
      .eq("empleado_id", empleadoId)
      .eq("anio", anio)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data as RrhhSaldoVacaciones | null) ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function setSaldoVacaciones(
  empleadoId: string,
  anio: number,
  diasOtorgados: number,
  observaciones?: string
): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_saldos_vacaciones")
      .upsert(
        {
          empleado_id: empleadoId,
          anio,
          dias_otorgados: diasOtorgados,
          observaciones: observaciones ?? null,
        },
        { onConflict: "empleado_id,anio" }
      )
    if (error) return { error: error.message }
    revalidatePath("/rrhh/configuracion")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Listados de solicitudes (filtran por rol vía RLS + queries)
// ===================================================

async function enrichSolicitudes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
): Promise<RrhhSolicitudConDetalle[]> {
  const supabase = await createClient()
  return rows.map((row) => {
    const certificadoUrl = row.certificado_path
      ? supabase.storage.from(BUCKET).getPublicUrl(row.certificado_path).data.publicUrl
      : null
    return {
      id: row.id,
      empleado_id: row.empleado_id,
      tipo_licencia_id: row.tipo_licencia_id,
      fecha_desde: row.fecha_desde,
      fecha_hasta: row.fecha_hasta,
      dias_solicitados: row.dias_solicitados,
      motivo: row.motivo,
      certificado_path: row.certificado_path,
      estado: row.estado,
      supervisor_id: row.supervisor_id,
      supervisor_decision_at: row.supervisor_decision_at,
      supervisor_observacion: row.supervisor_observacion,
      rrhh_user_id: row.rrhh_user_id,
      rrhh_decision_at: row.rrhh_decision_at,
      rrhh_observacion: row.rrhh_observacion,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      empleado_nombre: row.empleado?.nombre ?? "?",
      empleado_legajo: row.empleado?.legajo ?? 0,
      tipo_licencia_codigo: row.tipo?.codigo ?? "",
      tipo_licencia_nombre: row.tipo?.nombre ?? "",
      certificado_url: certificadoUrl,
    }
  })
}

const SOLICITUD_SELECT = `
  *,
  empleado:empleados!rrhh_solicitudes_licencia_empleado_id_fkey(id, legajo, nombre),
  tipo:rrhh_tipos_licencia!rrhh_solicitudes_licencia_tipo_licencia_id_fkey(id, codigo, nombre)
`

export async function listarMisSolicitudes(): Promise<
  Result<RrhhSolicitudConDetalle[]>
> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) return { data: [] }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .select(SOLICITUD_SELECT)
      .eq("empleado_id", empleadoId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: await enrichSolicitudes((data ?? []) as any[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function listarSolicitudesEquipo(): Promise<
  Result<RrhhSolicitudConDetalle[]>
> {
  try {
    await requireAuth()
    const miEmpleadoId = await getEmpleadoIdFromAuth()
    if (!miEmpleadoId) return { data: [] }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .select(SOLICITUD_SELECT)
      .eq("supervisor_id", miEmpleadoId)
      .order("created_at", { ascending: false })

    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: await enrichSolicitudes((data ?? []) as any[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function listarSolicitudesRRHH(filtroEstado?: string): Promise<
  Result<RrhhSolicitudConDetalle[]>
> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    let query = supabase
      .from("rrhh_solicitudes_licencia")
      .select(SOLICITUD_SELECT)
      .order("created_at", { ascending: false })

    if (filtroEstado) query = query.eq("estado", filtroEstado)

    const { data, error } = await query
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: await enrichSolicitudes((data ?? []) as any[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Crear solicitud (empleado)
// ===================================================
interface CrearSolicitudInput {
  tipo_licencia_id: string
  fecha_desde: string
  fecha_hasta: string
  motivo?: string
  certificado_path?: string | null
}

export async function crearSolicitud(
  input: CrearSolicitudInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) {
      return { error: "Tu usuario no está vinculado a un empleado." }
    }
    if (!input.tipo_licencia_id) return { error: "Tipo de licencia obligatorio" }
    if (!input.fecha_desde || !input.fecha_hasta) {
      return { error: "Rango de fechas obligatorio" }
    }
    const desde = new Date(input.fecha_desde)
    const hasta = new Date(input.fecha_hasta)
    if (hasta < desde) return { error: "fecha_hasta no puede ser anterior a fecha_desde" }

    const dias =
      Math.floor((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const supabase = await createClient()

    // Snapshot del supervisor actual del empleado.
    const { data: emp } = await supabase
      .from("empleados")
      .select("supervisor_id")
      .eq("id", empleadoId)
      .single()

    const { data, error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .insert({
        empleado_id: empleadoId,
        tipo_licencia_id: input.tipo_licencia_id,
        fecha_desde: input.fecha_desde,
        fecha_hasta: input.fecha_hasta,
        dias_solicitados: dias,
        motivo: input.motivo?.trim() || null,
        certificado_path: input.certificado_path ?? null,
        estado: "pendiente_supervisor",
        supervisor_id: emp?.supervisor_id ?? null,
        created_by: profile.id,
      })
      .select("id")
      .single()

    if (error) return { error: error.message }

    revalidatePath("/rrhh/mis-solicitudes")
    revalidatePath("/rrhh/mi-equipo")
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando solicitud" }
  }
}

// ===================================================
// Cancelar (empleado, sólo mientras esté pendiente_supervisor)
// ===================================================
export async function cancelarSolicitud(id: string): Promise<Ok> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .update({ estado: "cancelada" })
      .eq("id", id)
      .eq("estado", "pendiente_supervisor")
    if (error) return { error: error.message }
    revalidatePath("/rrhh/mis-solicitudes")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Decisión del supervisor
// ===================================================
async function decisionSupervisor(
  id: string,
  aprobar: boolean,
  observacion?: string
): Promise<Ok> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .update({
        estado: aprobar ? "pendiente_rrhh" : "rechazada",
        supervisor_decision_at: new Date().toISOString(),
        supervisor_observacion: observacion?.trim() || null,
      })
      .eq("id", id)
      .eq("estado", "pendiente_supervisor")
    if (error) return { error: error.message }
    revalidatePath("/rrhh/mi-equipo")
    revalidatePath("/rrhh/licencias")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function aprobarPorSupervisor(id: string, observacion?: string): Promise<Ok> {
  return decisionSupervisor(id, true, observacion)
}

export async function rechazarPorSupervisor(id: string, observacion?: string): Promise<Ok> {
  return decisionSupervisor(id, false, observacion)
}

// ===================================================
// Decisión RRHH (admin_rrhh / admin)
// ===================================================
export async function aprobarPorRRHH(id: string, observacion?: string): Promise<Ok> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .update({
        estado: "aprobada",
        rrhh_user_id: profile.id,
        rrhh_decision_at: new Date().toISOString(),
        rrhh_observacion: observacion?.trim() || null,
      })
      .eq("id", id)
      .eq("estado", "pendiente_rrhh")
    if (error) return { error: error.message }
    revalidatePath("/rrhh/licencias")
    revalidatePath("/asistencia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function rechazarPorRRHH(id: string, observacion?: string): Promise<Ok> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("rrhh_solicitudes_licencia")
      .update({
        estado: "rechazada",
        rrhh_user_id: profile.id,
        rrhh_decision_at: new Date().toISOString(),
        rrhh_observacion: observacion?.trim() || null,
      })
      .eq("id", id)
      .in("estado", ["pendiente_rrhh", "pendiente_supervisor"])
    if (error) return { error: error.message }
    revalidatePath("/rrhh/licencias")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

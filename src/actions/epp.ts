"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole, getEmpleadoIdFromAuth } from "@/lib/session"
import type {
  EmpleadoTalles,
  EmpleadoConTalles,
  EntregaEppConDetalle,
} from "@/types/database"

const MI_ROPA_PATH = "/mi-ropa"
const RRHH_EPP_PATH = "/rrhh/epp"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

interface TallesInput {
  talle_pantalon?: string | null
  talle_remera?: string | null
  talle_campera?: string | null
  talle_buzo?: string | null
  talle_botines?: string | null
}

// ===================================================
// Talles
// ===================================================

export async function getMisTalles(): Promise<Result<EmpleadoTalles | null>> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) return { data: null }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados_talles")
      .select("*")
      .eq("empleado_id", empleadoId)
      .maybeSingle()
    if (error) return { error: error.message }
    return { data: (data as EmpleadoTalles | null) ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

async function upsertTalles(empleadoId: string, input: TallesInput): Promise<Ok> {
  const supabase = await createClient()
  const { error } = await supabase.from("empleados_talles").upsert(
    {
      empleado_id: empleadoId,
      talle_pantalon: input.talle_pantalon || null,
      talle_remera: input.talle_remera || null,
      talle_campera: input.talle_campera || null,
      talle_buzo: input.talle_buzo || null,
      talle_botines: input.talle_botines || null,
    },
    { onConflict: "empleado_id" }
  )
  if (error) return { error: error.message }
  revalidatePath(MI_ROPA_PATH)
  revalidatePath(RRHH_EPP_PATH)
  return { success: true }
}

export async function guardarMisTalles(input: TallesInput): Promise<Ok> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) return { error: "Tu usuario no está vinculado a un empleado." }
    return await upsertTalles(empleadoId, input)
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando talles" }
  }
}

export async function guardarTallesEmpleado(
  empleadoId: string,
  input: TallesInput
): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    return await upsertTalles(empleadoId, input)
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando talles" }
  }
}

// Padrón de talles de empleados activos (para la tabla y el resumen de compras).
export async function listarTallesRRHH(): Promise<Result<EmpleadoConTalles[]>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("empleados")
      .select(`id, legajo, nombre, sector, puesto, talles:empleados_talles(*)`)
      .eq("activo", true)
      .order("nombre")
    if (error) return { error: error.message }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enriched: EmpleadoConTalles[] = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      legajo: row.legajo,
      nombre: row.nombre,
      sector: row.sector ?? null,
      puesto: row.puesto ?? null,
      // La FK es la PK de empleados_talles → PostgREST devuelve objeto, no array.
      talles: (Array.isArray(row.talles) ? row.talles[0] : row.talles) ?? null,
    }))
    return { data: enriched }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando talles" }
  }
}

// ===================================================
// Entregas
// ===================================================

const ENTREGA_SELECT = `
  *,
  empleado:empleados!entregas_epp_empleado_id_fkey(id, legajo, nombre),
  items:entregas_epp_items(*)
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enrichEntregas(rows: any[]): EntregaEppConDetalle[] {
  return rows.map((row) => ({
    id: row.id,
    numero: row.numero,
    empleado_id: row.empleado_id,
    estado: row.estado,
    fecha_entrega: row.fecha_entrega,
    entregado_por: row.entregado_por,
    observaciones: row.observaciones,
    confirmado_at: row.confirmado_at,
    reclamo_motivo: row.reclamo_motivo,
    resolucion: row.resolucion,
    resuelto_at: row.resuelto_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    empleado_nombre: row.empleado?.nombre ?? "?",
    empleado_legajo: row.empleado?.legajo ?? 0,
    items: row.items ?? [],
  }))
}

export async function listarEntregasRRHH(
  filtroEstado?: string
): Promise<Result<EntregaEppConDetalle[]>> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()

    let query = supabase
      .from("entregas_epp")
      .select(ENTREGA_SELECT)
      .order("created_at", { ascending: false })
    if (filtroEstado) query = query.eq("estado", filtroEstado)

    const { data, error } = await query
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: enrichEntregas((data ?? []) as any[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando entregas" }
  }
}

export async function listarMisEntregas(): Promise<Result<EntregaEppConDetalle[]>> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) return { data: [] }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("entregas_epp")
      .select(ENTREGA_SELECT)
      .eq("empleado_id", empleadoId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { data: enrichEntregas((data ?? []) as any[]) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando entregas" }
  }
}

interface CrearEntregaInput {
  empleado_id: string
  fecha_entrega: string
  observaciones?: string
  items: {
    tipo_item: string
    descripcion?: string
    talle?: string
    cantidad: number
  }[]
}

export async function crearEntrega(
  input: CrearEntregaInput
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireRole(["admin", "admin_rrhh"])
    if (!input.empleado_id) return { error: "Elegí un empleado" }
    if (!input.fecha_entrega) return { error: "Fecha de entrega obligatoria" }
    const items = (input.items ?? []).filter((i) => i.tipo_item)
    if (items.length === 0) return { error: "Agregá al menos un ítem" }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("entregas_epp")
      .insert({
        empleado_id: input.empleado_id,
        fecha_entrega: input.fecha_entrega,
        observaciones: input.observaciones?.trim() || null,
        entregado_por: profile.id,
      })
      .select("id")
      .single()
    if (error) return { error: error.message }

    const { error: itemsError } = await supabase.from("entregas_epp_items").insert(
      items.map((i) => ({
        entrega_id: data.id,
        tipo_item: i.tipo_item,
        descripcion: i.descripcion?.trim() || null,
        talle: i.talle || null,
        cantidad: i.cantidad > 0 ? i.cantidad : 1,
      }))
    )
    if (itemsError) {
      // Sin ítems la entrega no sirve: borrar la cabecera huérfana.
      await supabase.from("entregas_epp").delete().eq("id", data.id)
      return { error: itemsError.message }
    }

    revalidatePath(RRHH_EPP_PATH)
    revalidatePath(MI_ROPA_PATH)
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creando entrega" }
  }
}

export async function eliminarEntrega(id: string): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("entregas_epp")
      .delete()
      .eq("id", id)
      .eq("estado", "pendiente")
    if (error) return { error: error.message }
    revalidatePath(RRHH_EPP_PATH)
    revalidatePath(MI_ROPA_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ===================================================
// Ciclo de vida: confirmar / reclamar (empleado) → resolver (RRHH)
// ===================================================

export async function confirmarEntrega(id: string): Promise<Ok> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) return { error: "Tu usuario no está vinculado a un empleado." }

    const supabase = await createClient()
    const { error } = await supabase
      .from("entregas_epp")
      .update({ estado: "confirmada" })
      .eq("id", id)
      .eq("empleado_id", empleadoId)
      .eq("estado", "pendiente")
    if (error) return { error: error.message }
    revalidatePath(MI_ROPA_PATH)
    revalidatePath(RRHH_EPP_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function reclamarEntrega(id: string, motivo: string): Promise<Ok> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) return { error: "Tu usuario no está vinculado a un empleado." }
    if (!motivo?.trim()) return { error: "Contanos qué salió mal con la entrega" }

    const supabase = await createClient()
    const { error } = await supabase
      .from("entregas_epp")
      .update({ estado: "reclamada", reclamo_motivo: motivo.trim() })
      .eq("id", id)
      .eq("empleado_id", empleadoId)
      .eq("estado", "pendiente")
    if (error) return { error: error.message }
    revalidatePath(MI_ROPA_PATH)
    revalidatePath(RRHH_EPP_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function resolverReclamo(id: string, resolucion: string): Promise<Ok> {
  try {
    await requireRole(["admin", "admin_rrhh"])
    if (!resolucion?.trim()) return { error: "Escribí cómo se resolvió el reclamo" }

    const supabase = await createClient()
    const { error } = await supabase
      .from("entregas_epp")
      .update({ estado: "resuelta", resolucion: resolucion.trim() })
      .eq("id", id)
      .eq("estado", "reclamada")
    if (error) return { error: error.message }
    revalidatePath(RRHH_EPP_PATH)
    revalidatePath(MI_ROPA_PATH)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

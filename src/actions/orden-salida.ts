"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import {
  getEmpleadoIdFromAuth,
  requireAuth,
  requireRole,
} from "@/lib/session"
import type {
  AsignacionCamionDiario,
  CamionFlota,
  EmpleadoOrdenSalida,
  EstadoCamionDiario,
  MiOrdenDelDia,
  MotivoNoSale,
  PersonalNoSaleDiario,
  SucursalOrdenSalida,
} from "@/types/database"
import { fechaQueVeElEmpleado } from "@/lib/orden-salida-fechas"
import { IS_MISIONES } from "@/lib/empresa"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

const ROLES_EDITOR = ["admin", "admin_rrhh", "supervisor"] as const

// ============================================================================
// Catálogos: empleados activos del módulo + flota
// ============================================================================
export async function listarEmpleadosOrdenSalida(): Promise<
  Result<EmpleadoOrdenSalida[]>
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // empleados con sucursal cargada (= los que aplican al módulo)
    const { data: empleados, error } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, sector, puesto, sucursal, activo")
      .not("sucursal", "is", null)
      .order("nombre")
    if (error) return { error: error.message }

    // titulares: empleado_id → patente (catalogo_vehiculos.dominio)
    const { data: titulares, error: errT } = await supabase
      .from("orden_salida_titulares")
      .select("empleado_id, camion:catalogo_vehiculos!orden_salida_titulares_camion_id_fkey(dominio)")
    if (errT) return { error: errT.message }

    const titularPorEmp = new Map<string, string>()
    for (const t of (titulares ?? []) as unknown as Array<{
      empleado_id: string
      camion: { dominio: string } | null
    }>) {
      if (t.camion?.dominio) titularPorEmp.set(t.empleado_id, t.camion.dominio)
    }

    const out: EmpleadoOrdenSalida[] = (empleados ?? []).map((e) => ({
      id: e.id as string,
      legajo: (e.legajo as number | null) ?? null,
      nombre: e.nombre as string,
      sector: (e.sector as string | null) ?? null,
      puesto: (e.puesto as string | null) ?? null,
      sucursal: (e.sucursal as SucursalOrdenSalida | null) ?? null,
      activo: Boolean(e.activo),
      camion_fijo_patente: titularPorEmp.get(e.id as string) ?? null,
    }))

    return { data: out }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function listarFlota(): Promise<Result<CamionFlota[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_flota")
      .select(
        `vehiculo_id, sucursal, capacidad_kg, numero_unidad, activo,
         vehiculo:catalogo_vehiculos!orden_salida_flota_vehiculo_id_fkey(dominio)`
      )
      .eq("activo", true)
      .order("sucursal")
    if (error) return { error: error.message }

    const flota: CamionFlota[] = ((data ?? []) as unknown as Array<{
      vehiculo_id: string
      sucursal: SucursalOrdenSalida
      capacidad_kg: number | null
      numero_unidad: number | null
      activo: boolean
      vehiculo: { dominio: string } | null
    }>).map((r) => ({
      id: r.vehiculo_id,
      patente: r.vehiculo?.dominio ?? "",
      sucursal: r.sucursal,
      capacidad_kg: r.capacidad_kg,
      numero_unidad: r.numero_unidad,
      activo: r.activo,
    }))
    return { data: flota }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Asignaciones diarias por camión
// ============================================================================
export async function obtenerAsignaciones(
  fecha: string
): Promise<Result<AsignacionCamionDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_camion_diario")
      .select("*")
      .eq("fecha", fecha)
    if (error) return { error: error.message }
    return { data: (data ?? []) as AsignacionCamionDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function obtenerAsignacionesEnRango(
  desde: string,
  hasta: string
): Promise<Result<AsignacionCamionDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_camion_diario")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
    if (error) return { error: error.message }
    return { data: (data ?? []) as AsignacionCamionDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function obtenerNoSaleEnRango(
  desde: string,
  hasta: string
): Promise<Result<PersonalNoSaleDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_personal_no_sale")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
    if (error) return { error: error.message }
    return { data: (data ?? []) as PersonalNoSaleDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export interface AsignacionInput {
  fecha: string
  camion_id: string
  chofer_empleado_id?: string | null
  ayudante_empleado_id?: string | null
  zona?: string
  estado?: EstadoCamionDiario
  observacion?: string
  clientes?: number | null
  sobrecarga_completa?: number | null
  media_sobrecarga?: number | null
  cuarto_sobrecarga?: number | null
  bultos?: number | null
}

export async function upsertAsignacion(input: AsignacionInput): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()

    if (!input.fecha || !input.camion_id) {
      return { error: "Fecha y camión son obligatorios" }
    }

    // Si el estado pasa a algo distinto de "operativo", limpiamos tripulación
    // (consistente con la regla del cliente).
    const limpiar = input.estado && input.estado !== "operativo"
    const row = {
      fecha: input.fecha,
      camion_id: input.camion_id,
      chofer_empleado_id: limpiar ? null : input.chofer_empleado_id ?? null,
      ayudante_empleado_id: limpiar ? null : input.ayudante_empleado_id ?? null,
      zona: input.zona ?? "",
      estado: input.estado ?? "sin_asignar",
      observacion: input.observacion ?? "",
      clientes: input.clientes ?? null,
      sobrecarga_completa: input.sobrecarga_completa ?? null,
      media_sobrecarga: input.media_sobrecarga ?? null,
      cuarto_sobrecarga: input.cuarto_sobrecarga ?? null,
      bultos: input.bultos ?? null,
    }

    const { error } = await supabase
      .from("orden_salida_camion_diario")
      .upsert(row, { onConflict: "fecha,camion_id" })
    if (error) return { error: error.message }

    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function eliminarAsignacion(
  fecha: string,
  camionId: string
): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("orden_salida_camion_diario")
      .delete()
      .eq("fecha", fecha)
      .eq("camion_id", camionId)
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Personal que no sale
// ============================================================================
export async function obtenerNoSale(
  fecha: string
): Promise<Result<PersonalNoSaleDiario[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("orden_salida_personal_no_sale")
      .select("*")
      .eq("fecha", fecha)
    if (error) return { error: error.message }
    return { data: (data ?? []) as PersonalNoSaleDiario[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export interface NoSaleInput {
  fecha: string
  empleado_id: string
  motivo: MotivoNoSale
  detalle?: string
}

export async function upsertNoSale(input: NoSaleInput): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("orden_salida_personal_no_sale")
      .upsert(
        {
          fecha: input.fecha,
          empleado_id: input.empleado_id,
          motivo: input.motivo,
          detalle: input.detalle ?? "",
        },
        { onConflict: "fecha,empleado_id" }
      )
    if (error) return { error: error.message }

    // Si el empleado estaba en alguna asignación de ese día, sacarlo.
    const { error: errClean } = await supabase
      .from("orden_salida_camion_diario")
      .update({ chofer_empleado_id: null })
      .eq("fecha", input.fecha)
      .eq("chofer_empleado_id", input.empleado_id)
    if (errClean) return { error: errClean.message }
    const { error: errClean2 } = await supabase
      .from("orden_salida_camion_diario")
      .update({ ayudante_empleado_id: null })
      .eq("fecha", input.fecha)
      .eq("ayudante_empleado_id", input.empleado_id)
    if (errClean2) return { error: errClean2.message }

    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function quitarNoSale(
  fecha: string,
  empleadoId: string
): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("orden_salida_personal_no_sale")
      .delete()
      .eq("fecha", fecha)
      .eq("empleado_id", empleadoId)
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    revalidatePath("/mi-orden-del-dia")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Padrón: alta y anular/reactivar
// ============================================================================
export interface NuevoEmpleadoInput {
  nombre: string
  sucursal: SucursalOrdenSalida
  puesto: "Chofer" | "Ayudante" | "Depósito"
  legajo?: number | null
}

export async function agregarEmpleado(
  input: NuevoEmpleadoInput
): Promise<Result<{ id: string }>> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const nombre = input.nombre.trim().toUpperCase()
    if (!nombre) return { error: "El nombre es obligatorio" }

    const { data, error } = await supabase
      .from("empleados")
      .insert({
        nombre,
        sucursal: input.sucursal,
        puesto: input.puesto,
        sector: "Distribución",
        legajo: input.legajo ?? null,
        activo: true,
        numero_id: "", // se completa después si corresponde
      })
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    return { data: { id: data.id as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function setEmpleadoActivo(
  empleadoId: string,
  activo: boolean
): Promise<Ok> {
  try {
    await requireRole([...ROLES_EDITOR])
    const supabase = await createClient()
    const { error } = await supabase
      .from("empleados")
      .update({ activo })
      .eq("id", empleadoId)
    if (error) return { error: error.message }
    revalidatePath("/orden-salida")
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

export async function obtenerMiOrdenSalida(): Promise<Result<MiOrdenDelDia>> {
  try {
    await requireAuth()
    const empleadoId = await getEmpleadoIdFromAuth()
    if (!empleadoId) {
      return { error: "Tu usuario no está vinculado a un empleado." }
    }
    const fecha = fechaQueVeElEmpleado()
    const supabase = await createClient()

    // 1) ¿Está en una asignación de camión ese día?
    const { data: asig, error: errAsig } = await supabase
      .from("orden_salida_camion_diario")
      .select(
        `fecha, zona, observacion, chofer_empleado_id, ayudante_empleado_id,
         camion:catalogo_vehiculos!orden_salida_camion_diario_camion_id_fkey(dominio)`
      )
      .eq("fecha", fecha)
      .or(`chofer_empleado_id.eq.${empleadoId},ayudante_empleado_id.eq.${empleadoId}`)
      .limit(1)
      .maybeSingle()
    if (errAsig) return { error: errAsig.message }
    if (asig) {
      const a = asig as unknown as {
        fecha: string
        zona: string
        observacion: string
        chofer_empleado_id: string | null
        ayudante_empleado_id: string | null
        camion: { dominio: string } | null
      }
      return {
        data: {
          tipo: "asignacion",
          fecha: a.fecha,
          rol: a.chofer_empleado_id === empleadoId ? "chofer" : "ayudante",
          camion_patente: a.camion?.dominio ?? "",
          zona: a.zona ?? "",
          observacion: a.observacion ?? "",
        },
      }
    }

    // 2) ¿Está en la lista de "no sale"?
    const { data: no, error: errNo } = await supabase
      .from("orden_salida_personal_no_sale")
      .select("fecha, motivo, detalle")
      .eq("fecha", fecha)
      .eq("empleado_id", empleadoId)
      .maybeSingle()
    if (errNo) return { error: errNo.message }
    if (no) {
      return {
        data: {
          tipo: "no_sale",
          fecha: no.fecha as string,
          motivo: no.motivo as MotivoNoSale,
          detalle: (no.detalle as string) ?? "",
        },
      }
    }

    // 3) Sin definir
    return { data: { tipo: "sin_definir", fecha } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

// ============================================================================
// Sincronización desde Google Sheets (solo Misiones)
// La lógica vive en `@/lib/orden-salida-sync-core` para que el cron diario
// (`/api/orden-salida/cron-sync`) pueda reusarla con admin client.
// ============================================================================

export type { SyncOrdenSalidaResult } from "@/lib/orden-salida-sync-core"
import { runOrdenSalidaSync, type SyncOrdenSalidaResult as _SyncOrdenSalidaResult } from "@/lib/orden-salida-sync-core"

export async function sincronizarOrdenSalidaDesdeSheets(
  ultimosDias: number
): Promise<Result<_SyncOrdenSalidaResult>> {
  try {
    await requireRole([...ROLES_EDITOR])
    if (!IS_MISIONES) {
      return { error: "La sincronización con la planilla solo está disponible en Misiones." }
    }
    const supabase = await createClient()
    const res = await runOrdenSalidaSync(ultimosDias, supabase)
    if ("data" in res) {
      revalidatePath("/orden-salida")
      revalidatePath("/mi-orden-del-dia")
      revalidatePath("/indicadores/sobrecargas")
    }
    return res
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

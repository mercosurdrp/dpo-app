"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type { EjeNeumatico } from "@/lib/vehiculos/neumaticos-layout"
import {
  PROFUNDIDAD_CRITICA_MM,
  type Alineacion,
  type Neumatico,
  type NeumaticoMedicion,
  type NeumaticosResumen,
  type NeumaticoTipo,
  type NeumaticoEstado,
} from "@/lib/vehiculos/neumaticos-tipos"

// ==================== LECTURA ====================

export async function getNeumaticos(): Promise<
  { data: Neumatico[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_neumaticos")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }

    const ids = (data || []).map((n) => n.id)
    let medByNeum = new Map<string, NeumaticoMedicion[]>()
    if (ids.length > 0) {
      const { data: meds, error: medErr } = await supabase
        .from("mantenimiento_neumatico_mediciones")
        .select("*")
        .in("neumatico_id", ids)
        .order("fecha", { ascending: false })
      if (medErr) return { error: medErr.message }
      medByNeum = (meds || []).reduce((acc, m) => {
        const arr = acc.get(m.neumatico_id) ?? []
        arr.push(m as NeumaticoMedicion)
        acc.set(m.neumatico_id, arr)
        return acc
      }, new Map<string, NeumaticoMedicion[]>())
    }

    return {
      data: (data || []).map((n) => ({
        ...(n as Neumatico),
        mediciones: medByNeum.get(n.id) ?? [],
      })),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function getNeumaticosResumen(): Promise<NeumaticosResumen> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data } = await supabase
      .from("mantenimiento_neumaticos")
      .select("estado, profundidad_actual_mm, fecha_baja")
    const rows = (data || []) as Array<{
      estado: NeumaticoEstado
      profundidad_actual_mm: number | null
      fecha_baja: string | null
    }>
    const ahora = new Date()
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`
    let stock = 0
    let instalados = 0
    let criticos = 0
    let bajasMes = 0
    for (const r of rows) {
      if (r.estado === "stock") stock++
      else if (r.estado === "instalado") {
        instalados++
        if (r.profundidad_actual_mm != null && r.profundidad_actual_mm <= PROFUNDIDAD_CRITICA_MM)
          criticos++
      } else if (r.estado === "baja") {
        if (r.fecha_baja?.slice(0, 7) === mesActual) bajasMes++
      }
    }
    return { stock, instalados, criticos, bajasMes }
  } catch {
    return { stock: 0, instalados: 0, criticos: 0, bajasMes: 0 }
  }
}

// ==================== ESCRITURA ====================

/** Alta masiva de cubiertas al stock. Si `numeros` viene, crea una por número;
 *  si no, crea `cantidad` cubiertas sin número. */
export async function crearNeumaticosMasivo(input: {
  tipo: NeumaticoTipo
  marca?: string
  medida?: string
  profundidad_inicial_mm?: number | null
  cantidad?: number
  numeros?: string[]
}): Promise<{ success: true; creados: number } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const numeros = (input.numeros ?? [])
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
    const cantidad = numeros.length > 0 ? numeros.length : Math.floor(input.cantidad ?? 0)
    if (cantidad < 1) return { error: "Indicá una cantidad o al menos un número" }
    if (cantidad > 200) return { error: "Máximo 200 cubiertas por carga" }

    const base = {
      tipo: input.tipo,
      marca: input.marca?.trim() || null,
      medida: input.medida?.trim() || null,
      profundidad_inicial_mm: input.profundidad_inicial_mm ?? null,
      profundidad_actual_mm: input.profundidad_inicial_mm ?? null,
      estado: "stock" as const,
      created_by: profile.id,
    }
    const filas =
      numeros.length > 0
        ? numeros.map((numero) => ({ ...base, numero }))
        : Array.from({ length: cantidad }, () => ({ ...base, numero: null }))

    const { error } = await supabase.from("mantenimiento_neumaticos").insert(filas)
    if (error) return { error: error.message }
    return { success: true, creados: filas.length }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Instala una cubierta del stock en una unidad/posición. */
export async function asignarNeumatico(input: {
  id: string
  dominio: string
  posicion: string
  eje: EjeNeumatico | null
  km_instalacion?: number | null
  fecha_instalacion?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    if (!input.dominio || !input.posicion) return { error: "Falta unidad o posición" }
    const supabase = await createClient()

    // La posición no puede estar ocupada por otra cubierta instalada.
    const { data: ocupa } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id")
      .eq("dominio", input.dominio.toUpperCase())
      .eq("posicion", input.posicion)
      .eq("estado", "instalado")
      .neq("id", input.id)
      .maybeSingle()
    if (ocupa) return { error: "Esa posición ya tiene una cubierta instalada" }

    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .update({
        dominio: input.dominio.toUpperCase(),
        posicion: input.posicion,
        eje: input.eje,
        km_instalacion: input.km_instalacion ?? null,
        estado: "instalado",
        fecha_instalacion: input.fecha_instalacion ?? new Date().toISOString().slice(0, 10),
        fecha_baja: null,
        motivo_baja: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Quita la cubierta de la unidad y la devuelve al stock. */
export async function quitarNeumatico(input: {
  id: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .update({
        dominio: null,
        posicion: null,
        eje: null,
        estado: "stock",
        fecha_instalacion: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Da de baja una cubierta (gastada / dañada). */
export async function darDeBajaNeumatico(input: {
  id: string
  motivo: string
  fecha_baja?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    if (!input.motivo?.trim()) return { error: "Indicá el motivo de baja" }
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .update({
        estado: "baja",
        dominio: null,
        posicion: null,
        eje: null,
        motivo_baja: input.motivo.trim(),
        fecha_baja: input.fecha_baja ?? new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Registra una medición de desgaste y actualiza la profundidad actual. */
export async function registrarMedicionNeumatico(input: {
  neumatico_id: string
  profundidad_mm?: number | null
  km?: number | null
  presion_psi?: number | null
  nota?: string
  fecha?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error: insErr } = await supabase
      .from("mantenimiento_neumatico_mediciones")
      .insert({
        neumatico_id: input.neumatico_id,
        fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
        profundidad_mm: input.profundidad_mm ?? null,
        km: input.km ?? null,
        presion_psi: input.presion_psi ?? null,
        nota: input.nota?.trim() || null,
        created_by: profile.id,
      })
    if (insErr) return { error: insErr.message }

    if (input.profundidad_mm != null) {
      await supabase
        .from("mantenimiento_neumaticos")
        .update({
          profundidad_actual_mm: input.profundidad_mm,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.neumatico_id)
    }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarNeumatico(input: {
  id: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .delete()
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ALINEACIONES ====================

export async function getAlineaciones(): Promise<
  { data: Alineacion[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_alineaciones")
      .select("*")
      .order("fecha", { ascending: false })
    if (error) return { error: error.message }
    return { data: (data || []) as Alineacion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Registra una alineación de una unidad. */
export async function registrarAlineacion(input: {
  dominio: string
  fecha?: string
  km?: number | null
  proxima_fecha?: string | null
  proxima_km?: number | null
  observaciones?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.dominio) return { error: "Falta la unidad" }
    const supabase = await createClient()
    const { error } = await supabase.from("mantenimiento_alineaciones").insert({
      dominio: input.dominio.toUpperCase(),
      fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
      km: input.km ?? null,
      proxima_fecha: input.proxima_fecha || null,
      proxima_km: input.proxima_km ?? null,
      observaciones: input.observaciones?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function eliminarAlineacion(input: {
  id: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_alineaciones")
      .delete()
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

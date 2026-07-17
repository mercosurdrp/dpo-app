"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import type { EjeNeumatico } from "@/lib/vehiculos/neumaticos-layout"
import {
  fetchLecturas,
  kmActualPorDominio,
  daysBetween,
  addDays,
  today,
} from "@/lib/vehiculos/lecturas"
import {
  PROFUNDIDAD_CRITICA_MM,
  type Alineacion,
  type Neumatico,
  type NeumaticoMedicion,
  type NeumaticosResumen,
  type NeumaticoTipo,
  type NeumaticoEstado,
  type Rotacion,
} from "@/lib/vehiculos/neumaticos-tipos"

export interface KmFlotaUnidad {
  kmActual: number | null
  kmDia: number | null
  fecha: string | null
}

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
  /** Factura de compra (misma factura para todo el lote de la carga). */
  factura_urls?: string[]
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
      factura_urls: input.factura_urls?.length ? input.factura_urls : null,
      created_by: profile.id,
    }
    const filas: Array<typeof base & { numero: string | null }> =
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

/** Edita los datos de una cubierta (número, marca, medida, factura). */
export async function actualizarNeumatico(input: {
  id: string
  numero?: string | null
  marca?: string | null
  medida?: string | null
  factura_urls?: string[] | null
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.numero !== undefined) update.numero = input.numero?.trim() || null
    if (input.marca !== undefined) update.marca = input.marca?.trim() || null
    if (input.medida !== undefined) update.medida = input.medida?.trim() || null
    if (input.factura_urls !== undefined) {
      update.factura_urls = input.factura_urls?.length ? input.factura_urls : null
    }
    if (Object.keys(update).length === 0) return { success: true }
    const { error } = await supabase
      .from("mantenimiento_neumaticos")
      .update(update)
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
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
  vida_util_km?: number | null
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
        vida_util_km: input.vida_util_km ?? null,
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

/**
 * Carga una cubierta nueva/recapada y la instala directo en una unidad/posición
 * (compra y colocación, sin pasar por el stock).
 */
export async function crearYColocarNeumatico(input: {
  dominio: string
  posicion: string
  eje: EjeNeumatico | null
  tipo: NeumaticoTipo
  numero?: string
  marca?: string
  medida?: string
  profundidad_inicial_mm?: number | null
  km_instalacion?: number | null
  vida_util_km?: number | null
  fecha_instalacion?: string
}): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (!input.dominio || !input.posicion) return { error: "Falta unidad o posición" }
    const supabase = await createClient()

    // La posición no puede estar ocupada por otra cubierta instalada.
    const { data: ocupa } = await supabase
      .from("mantenimiento_neumaticos")
      .select("id")
      .eq("dominio", input.dominio.toUpperCase())
      .eq("posicion", input.posicion)
      .eq("estado", "instalado")
      .maybeSingle()
    if (ocupa) return { error: "Esa posición ya tiene una cubierta instalada" }

    const { error } = await supabase.from("mantenimiento_neumaticos").insert({
      tipo: input.tipo,
      numero: input.numero?.trim() || null,
      marca: input.marca?.trim() || null,
      medida: input.medida?.trim() || null,
      profundidad_inicial_mm: input.profundidad_inicial_mm ?? null,
      profundidad_actual_mm: input.profundidad_inicial_mm ?? null,
      estado: "instalado",
      dominio: input.dominio.toUpperCase(),
      posicion: input.posicion,
      eje: input.eje,
      km_instalacion: input.km_instalacion ?? null,
      vida_util_km: input.vida_util_km ?? null,
      fecha_instalacion: input.fecha_instalacion ?? new Date().toISOString().slice(0, 10),
      created_by: profile.id,
    })
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

/** Registra una alineación/balanceo de una unidad. */
export async function registrarAlineacion(input: {
  dominio: string
  fecha?: string
  km?: number | null
  proxima_fecha?: string | null
  proxima_km?: number | null
  costo?: number | null
  proveedor?: string
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
      costo: input.costo ?? null,
      proveedor: input.proveedor?.trim() || null,
      observaciones: input.observaciones?.trim() || null,
      created_by: profile.id,
    })
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/** Intervalo de km global para rotación y alineación (config de mantenimiento). */
export async function getMantenimientoConfig(): Promise<{ rotacion_km: number }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data } = await supabase
      .from("mantenimiento_config")
      .select("rotacion_km")
      .eq("id", true)
      .maybeSingle()
    return { rotacion_km: data?.rotacion_km ?? 20000 }
  } catch {
    return { rotacion_km: 20000 }
  }
}

/** Cambia el intervalo de km global de rotación/alineación. */
export async function setRotacionKm(input: {
  rotacion_km: number
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const km = Math.round(Number(input.rotacion_km))
    if (!Number.isFinite(km) || km <= 0) return { error: "El intervalo debe ser mayor a 0" }
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_config")
      .upsert({ id: true, rotacion_km: km, updated_at: new Date().toISOString() })
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

// ==================== KM ACTUAL / TASA POR UNIDAD ====================

/**
 * Km actual y tasa de km/día por unidad, a partir de las lecturas diarias
 * (registros + checklists + combustible). Sirve para estimar la vida útil de
 * los neumáticos y la próxima rotación, y se actualiza solo con la carga diaria.
 */
export async function getKmFlota(): Promise<{
  data: Record<string, KmFlotaUnidad>
}> {
  try {
    await requireAuth()
    // Ventana de ~120 días para medir la tasa km/día.
    const desde = addDays(today(), -120)
    const lecturas = await fetchLecturas({ fechaDesde: desde })
    const kmActualMap = kmActualPorDominio(lecturas)

    // Tasa km/día: por dominio, primera y última lectura "limpia" (creciente).
    const porDominio = new Map<string, { fecha: string; hora: string; odometro: number }[]>()
    for (const l of lecturas) {
      if (!porDominio.has(l.dominio)) porDominio.set(l.dominio, [])
      porDominio.get(l.dominio)!.push({ fecha: l.fecha, hora: l.hora, odometro: l.odometro })
    }

    const out: Record<string, KmFlotaUnidad> = {}
    for (const [dominio, arr] of porDominio) {
      arr.sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.hora < b.hora ? -1 : 1))
      // secuencia creciente limpia
      let max = -Infinity
      let primero: { fecha: string; odometro: number } | null = null
      let ultimo: { fecha: string; odometro: number } | null = null
      for (const l of arr) {
        if (l.odometro >= max) {
          max = l.odometro
          if (!primero) primero = { fecha: l.fecha, odometro: l.odometro }
          ultimo = { fecha: l.fecha, odometro: l.odometro }
        }
      }
      let kmDia: number | null = null
      if (primero && ultimo) {
        const dias = daysBetween(primero.fecha, ultimo.fecha)
        if (dias > 0) {
          const tasa = (ultimo.odometro - primero.odometro) / dias
          // descartar tasas absurdas (errores de carga)
          if (tasa > 0 && tasa <= 1500) kmDia = Math.round(tasa)
        }
      }
      const actual = kmActualMap.get(dominio)
      out[dominio] = {
        kmActual: actual?.odometro ?? null,
        kmDia,
        fecha: actual?.fecha ?? null,
      }
    }
    return { data: out }
  } catch {
    return { data: {} }
  }
}

// ==================== ROTACIONES ====================

export async function getRotaciones(): Promise<
  { data: Rotacion[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_rotaciones")
      .select("*")
      .order("fecha", { ascending: false })
    if (error) return { error: error.message }
    return { data: (data || []) as Rotacion[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function registrarRotacion(input: {
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
    const { error } = await supabase.from("mantenimiento_rotaciones").insert({
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

export async function eliminarRotacion(input: {
  id: string
}): Promise<{ success: true } | { error: string }> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_rotaciones")
      .delete()
      .eq("id", input.id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// La generación de OT desde Neumáticos ahora usa createMantenimiento (misma OT
// que la pestaña Órdenes de Trabajo: N° correlativo automático, taller, costos).

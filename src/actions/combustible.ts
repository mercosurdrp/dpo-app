"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { validarLitros } from "@/lib/vehiculos/combustible-limites"
import {
  esCargaSinRegistrar,
  FACTOR_CARGA_FALTANTE,
  medianasPorDominio,
} from "@/lib/vehiculos/combustible-limpio"
import { TIPO_CARGA_GASOIL } from "@/lib/vehiculos/tipos-carga"
import { validarLectura } from "@/lib/vehiculos/validar-lectura"
import { addDays, fetchLecturas, kmActualPorDominio } from "@/lib/vehiculos/lecturas"
import type {
  RegistroCombustible,
  RendimientoSemanal,
  RendimientoMensual,
} from "@/types/database"

// ==================== CREAR REGISTRO ====================

interface CreateCombustibleInput {
  fecha: string
  dominio: string
  chofer: string
  odometro: number
  litros: number
  tipo_combustible?: string
  proveedor?: string
  numero_remito?: string
  costo_total?: number
  observaciones?: string
}

/**
 * Aviso que vuelve con la carga guardada cuando el tramo rinde más de 1,4× la
 * mediana del camión: casi siempre es una carga anterior que no se anotó
 * (DPO Flota 3.3, SOP de Combustible: el chofer la registra en el momento).
 * La carga se guarda igual, con la sospecha anotada en `observaciones`, y el
 * formulario ofrece registrar la que faltó.
 */
export interface AvisoCargaFaltante {
  rendimiento: number
  /** km/l habitual del camión (mediana de los tramos plausibles). */
  mediana: number
}

export interface CreateCombustibleResult {
  data: RegistroCombustible
  cargaFaltante: AvisoCargaFaltante | null
  /**
   * true cuando esta carga se metió ENTRE dos cargas ya registradas (una que
   * faltaba) y se recalculó el km/l de la siguiente.
   */
  recalculoSiguiente: boolean
}

/** Días de historial del camión para la mediana de rendimiento. */
const HISTORIAL_MEDIANA_DIAS = 120

export async function createRegistroCombustible(
  input: CreateCombustibleInput
): Promise<CreateCombustibleResult | { error: string }> {
  try {
    const profile = await requireAuth()
    const errorLitros = validarLitros(input.litros)
    if (errorLitros) return { error: errorLitros }
    const supabase = await createClient()

    // 🚨 Odómetro mal tipeado: se rechaza antes de guardar. Además de romper el
    // rendimiento (km recorridos), la lectura queda como km actual de la unidad
    // y descoloca el plan de mantenimiento y el estado de las cubiertas.
    const dominioNorm = input.dominio.trim().toUpperCase()
    const lecturasPrevias = await fetchLecturas({
      dominio: dominioNorm,
      fechaDesde: addDays(input.fecha, -120),
      fechaHasta: input.fecha,
    })
    const errorLectura = validarLectura({
      valor: input.odometro,
      previa: kmActualPorDominio(lecturasPrevias).get(dominioNorm) ?? null,
      fecha: input.fecha,
    })
    if (errorLectura) return { error: errorLectura }

    // Find previous record for same vehicle to calculate km_recorridos
    // 🚨 Del MISMO tipo de carga: la urea comparte tabla, y medir el gasoil
    // contra una carga de urea (o al revés) da un km/l inventado.
    const tipoCarga = input.tipo_combustible || TIPO_CARGA_GASOIL
    const { data: prevRecord } = await supabase
      .from("registro_combustible")
      .select("odometro")
      .eq("dominio", input.dominio.trim().toUpperCase())
      .eq("tipo_combustible", tipoCarga)
      .lt("odometro", input.odometro)
      .order("odometro", { ascending: false })
      .limit(1)
      .single()

    let kmRecorridos: number | null = null
    let rendimiento: number | null = null

    if (prevRecord) {
      kmRecorridos = input.odometro - prevRecord.odometro
      if (input.litros > 0 && kmRecorridos > 0) {
        rendimiento = Math.round((kmRecorridos / input.litros) * 100) / 100
      }
    }

    // ¿Falta una carga en el medio? Un tramo que rinde mucho más que lo
    // habitual del camión no es un chofer eficiente: son litros que entraron
    // al tanque sin pasar por la app. Se avisa en el momento, que es cuando el
    // chofer todavía se acuerda de la carga que no anotó.
    let cargaFaltante: AvisoCargaFaltante | null = null
    let observaciones = input.observaciones?.trim() || null
    if (tipoCarga === TIPO_CARGA_GASOIL && kmRecorridos != null && kmRecorridos > 0) {
      const { data: historial } = await supabase
        .from("registro_combustible")
        .select("dominio, litros, km_recorridos")
        .eq("dominio", dominioNorm)
        .eq("tipo_combustible", TIPO_CARGA_GASOIL)
        .gte("fecha", addDays(input.fecha, -HISTORIAL_MEDIANA_DIAS))
        .lte("fecha", input.fecha)
      const medianas = medianasPorDominio(historial ?? [])
      const tramo = { dominio: dominioNorm, litros: input.litros, km_recorridos: kmRecorridos }
      if (esCargaSinRegistrar(tramo, medianas)) {
        const mediana = medianas.get(dominioNorm) ?? null
        cargaFaltante = {
          rendimiento: Math.round((kmRecorridos / input.litros) * 100) / 100,
          mediana: mediana != null ? Math.round(mediana * 100) / 100 : 0,
        }
        const nota = mediana != null
          ? `Posible carga anterior sin registrar: ${cargaFaltante.rendimiento} km/l contra ${cargaFaltante.mediana} habitual (más de ${FACTOR_CARGA_FALTANTE}×).`
          : `Posible carga anterior sin registrar: ${cargaFaltante.rendimiento} km/l, fuera del rango plausible.`
        observaciones = observaciones ? `${observaciones} · ${nota}` : nota
      }
    }

    const { data, error } = await supabase
      .from("registro_combustible")
      .insert({
        fecha: input.fecha,
        dominio: dominioNorm,
        chofer: input.chofer.trim().toUpperCase(),
        odometro: input.odometro,
        litros: input.litros,
        km_recorridos: kmRecorridos,
        rendimiento,
        tipo_combustible: tipoCarga,
        proveedor: input.proveedor?.trim() || null,
        numero_remito: input.numero_remito?.trim() || null,
        costo_total: input.costo_total || null,
        observaciones,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    // Carga que se registra DESPUÉS de la siguiente (la que faltaba): el tramo
    // de la carga posterior quedó medido contra una carga más vieja y hay que
    // partirlo. Sin esto, registrar la carga olvidada no arreglaba el km/l.
    let recalculoSiguiente = false
    const { data: siguiente } = await supabase
      .from("registro_combustible")
      .select("id, odometro, litros")
      .eq("dominio", dominioNorm)
      .eq("tipo_combustible", tipoCarga)
      .gt("odometro", input.odometro)
      .order("odometro", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (siguiente) {
      const kmSig = Number(siguiente.odometro) - input.odometro
      const litrosSig = Number(siguiente.litros)
      await supabase
        .from("registro_combustible")
        .update({
          km_recorridos: kmSig,
          rendimiento:
            kmSig > 0 && litrosSig > 0 ? Math.round((kmSig / litrosSig) * 100) / 100 : null,
        })
        .eq("id", siguiente.id)
      recalculoSiguiente = true
    }

    return { data: data as RegistroCombustible, cargaFaltante, recalculoSiguiente }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ÚLTIMO PRECIO POR LITRO ====================

export interface PrecioLitroReciente {
  precioLitro: number
  fecha: string
}

/**
 * Último precio pagado por litro de gasoil, por camión y para la flota, a
 * partir de las cargas que tienen costo. Sirve para sugerir el costo del
 * ticket en el formulario (SOP de Combustible: cada carga con su costo).
 */
export async function getUltimosPreciosLitro(): Promise<{
  porDominio: Record<string, PrecioLitroReciente>
  flota: PrecioLitroReciente | null
}> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data } = await supabase
      .from("registro_combustible")
      .select("dominio, fecha, litros, costo_total")
      .eq("tipo_combustible", TIPO_CARGA_GASOIL)
      .not("costo_total", "is", null)
      .gt("litros", 0)
      .order("fecha", { ascending: false })
      .limit(200)
    const porDominio: Record<string, PrecioLitroReciente> = {}
    let flota: PrecioLitroReciente | null = null
    for (const r of data ?? []) {
      const costo = Number(r.costo_total)
      const litros = Number(r.litros)
      if (!(costo > 0) || !(litros > 0)) continue
      const precioLitro = Math.round((costo / litros) * 100) / 100
      if (!flota) flota = { precioLitro, fecha: r.fecha }
      if (!porDominio[r.dominio]) porDominio[r.dominio] = { precioLitro, fecha: r.fecha }
    }
    return { porDominio, flota }
  } catch {
    return { porDominio: {}, flota: null }
  }
}

// ==================== LISTAR REGISTROS ====================

interface CombustibleFilter {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
  chofer?: string
  limit?: number
}

export async function getRegistrosCombustible(
  filters?: CombustibleFilter
): Promise<{ data: RegistroCombustible[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // 🚨 El módulo de Combustible muestra SÓLO gasoil: la urea vive en la misma
    // tabla y tiene su propia pantalla.
    let query = supabase
      .from("registro_combustible")
      .select("*")
      .eq("tipo_combustible", TIPO_CARGA_GASOIL)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.chofer) query = query.eq("chofer", filters.chofer)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as RegistroCombustible[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== UPDATE ====================

interface UpdateCombustibleInput {
  id: string
  fecha: string
  dominio: string
  chofer: string
  odometro: number
  litros: number
  tipo_combustible?: string | null
  proveedor?: string | null
  numero_remito?: string | null
  costo_total?: number | null
  observaciones?: string | null
}

export async function updateRegistroCombustible(
  input: UpdateCombustibleInput
): Promise<{ data: RegistroCombustible } | { error: string }> {
  try {
    await requireAuth()
    const errorLitros = validarLitros(input.litros)
    if (errorLitros) return { error: errorLitros }
    const supabase = await createClient()

    // Recalcular km_recorridos + rendimiento en base al registro previo del
    // mismo vehículo (el que tiene odómetro inmediatamente menor, ignorando
    // el mismo registro que estoy editando).
    const tipoCarga = input.tipo_combustible || TIPO_CARGA_GASOIL
    const { data: prev } = await supabase
      .from("registro_combustible")
      .select("odometro")
      .eq("dominio", input.dominio.trim().toUpperCase())
      // 🚨 Mismo tipo: ver el comentario de `createRegistroCombustible`.
      .eq("tipo_combustible", tipoCarga)
      .lt("odometro", input.odometro)
      .neq("id", input.id)
      .order("odometro", { ascending: false })
      .limit(1)
      .single()

    let kmRecorridos: number | null = null
    let rendimiento: number | null = null
    if (prev) {
      kmRecorridos = input.odometro - prev.odometro
      if (input.litros > 0 && kmRecorridos > 0) {
        rendimiento = Math.round((kmRecorridos / input.litros) * 100) / 100
      }
    }

    const { data, error } = await supabase
      .from("registro_combustible")
      .update({
        fecha: input.fecha,
        dominio: input.dominio.trim().toUpperCase(),
        chofer: input.chofer.trim().toUpperCase(),
        odometro: input.odometro,
        litros: input.litros,
        km_recorridos: kmRecorridos,
        rendimiento,
        tipo_combustible: tipoCarga,
        proveedor: input.proveedor?.trim() || null,
        numero_remito: input.numero_remito?.trim() || null,
        costo_total: input.costo_total ?? null,
        observaciones: input.observaciones?.trim() || null,
      })
      .eq("id", input.id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as RegistroCombustible }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DELETE ====================

export async function deleteRegistroCombustible(
  id: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("registro_combustible")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== KPIs RENDIMIENTO ====================

export async function getRendimientoKpis(filters?: {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
}): Promise<{
  data: {
    totalCargas: number
    totalLitros: number
    totalKm: number
    promedioRendimiento: number
    promedioRendimientoL100: number
    semanal: RendimientoSemanal[]
    mensual: RendimientoMensual[]
    porVehiculo: {
      dominio: string
      cargas: number
      litros: number
      km: number
      rendimiento: number
    }[]
  }
} | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("registro_combustible")
      .select("*")
      // 🚨 El km/l es del gasoil; la urea no es combustible.
      .eq("tipo_combustible", TIPO_CARGA_GASOIL)
      .not("km_recorridos", "is", null)
      .not("rendimiento", "is", null)
      .order("fecha", { ascending: true })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)

    const { data, error } = await query
    if (error) return { error: error.message }

    const registros = (data || []) as RegistroCombustible[]

    if (registros.length === 0) {
      return {
        data: {
          totalCargas: 0,
          totalLitros: 0,
          totalKm: 0,
          promedioRendimiento: 0,
          promedioRendimientoL100: 0,
          semanal: [],
          mensual: [],
          porVehiculo: [],
        },
      }
    }

    const totalCargas = registros.length
    const totalLitros = registros.reduce((a, r) => a + Number(r.litros), 0)
    const totalKm = registros.reduce((a, r) => a + (r.km_recorridos || 0), 0)
    const promedioRendimiento =
      totalLitros > 0
        ? Math.round((totalKm / totalLitros) * 100) / 100
        : 0
    const promedioRendimientoL100 =
      totalKm > 0
        ? Math.round((totalLitros / totalKm) * 10000) / 100
        : 0

    // Group by week
    const semanalMap = new Map<string, { litros: number; km: number; cargas: number; year: number; semana: number }>()
    for (const r of registros) {
      const date = new Date(r.fecha + "T12:00:00")
      const startOfYear = new Date(date.getFullYear(), 0, 1)
      const diff = date.getTime() - startOfYear.getTime()
      const semana = Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7)
      const year = date.getFullYear()
      const key = `${year}-${semana}`
      if (!semanalMap.has(key)) semanalMap.set(key, { litros: 0, km: 0, cargas: 0, year, semana })
      const g = semanalMap.get(key)!
      g.litros += Number(r.litros)
      g.km += r.km_recorridos || 0
      g.cargas++
    }
    const semanal: RendimientoSemanal[] = Array.from(semanalMap.values()).map((g) => ({
      semana: g.semana,
      year: g.year,
      promedio_rendimiento: g.litros > 0 ? Math.round((g.km / g.litros) * 100) / 100 : 0,
      total_litros: Math.round(g.litros * 100) / 100,
      total_km: g.km,
      total_cargas: g.cargas,
    }))

    // Group by month
    const mensualMap = new Map<string, { litros: number; km: number; cargas: number; year: number; mes: number }>()
    for (const r of registros) {
      const d = new Date(r.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key)) mensualMap.set(key, { litros: 0, km: 0, cargas: 0, year, mes })
      const g = mensualMap.get(key)!
      g.litros += Number(r.litros)
      g.km += r.km_recorridos || 0
      g.cargas++
    }
    const mensual: RendimientoMensual[] = Array.from(mensualMap.values()).map((g) => ({
      mes: g.mes,
      year: g.year,
      promedio_rendimiento: g.litros > 0 ? Math.round((g.km / g.litros) * 100) / 100 : 0,
      total_litros: Math.round(g.litros * 100) / 100,
      total_km: g.km,
      total_cargas: g.cargas,
    }))

    // Group by vehicle
    const vehMap = new Map<string, { litros: number; km: number; cargas: number }>()
    for (const r of registros) {
      if (!vehMap.has(r.dominio)) vehMap.set(r.dominio, { litros: 0, km: 0, cargas: 0 })
      const g = vehMap.get(r.dominio)!
      g.litros += Number(r.litros)
      g.km += r.km_recorridos || 0
      g.cargas++
    }
    const porVehiculo = Array.from(vehMap.entries())
      .map(([dominio, g]) => ({
        dominio,
        cargas: g.cargas,
        litros: Math.round(g.litros * 100) / 100,
        km: g.km,
        rendimiento: g.litros > 0 ? Math.round((g.km / g.litros) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.rendimiento - a.rendimiento)

    return {
      data: {
        totalCargas,
        totalLitros: Math.round(totalLitros * 100) / 100,
        totalKm,
        promedioRendimiento,
        promedioRendimientoL100,
        semanal,
        mensual,
        porVehiculo,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

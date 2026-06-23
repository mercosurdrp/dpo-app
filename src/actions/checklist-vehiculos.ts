"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  ChecklistItem,
  ChecklistVehiculo,
  ChecklistVehiculoConRespuestas,
  TipoChecklist,
  ResultadoChecklist,
  TiempoRutaSemanal,
  TiempoRutaMensual,
} from "@/types/database"

const TIEMPO_RUTA_META_MINUTOS = 480 // 8 horas

// Corte horario (hora local Argentina) que define el tipo de checklist:
// antes de las 09:00 → liberación (salida del depósito); 09:00 o después →
// retorno (entrada al depósito). El chofer ya no elige el tipo; se deriva de
// la hora para que los km (odómetro retorno − liberación), el tiempo en ruta y
// el estado de la flota se calculen siempre con la clasificación correcta.
const HORA_CORTE_LIBERACION = 9

/** Hora del día (0-23) en zona horaria de Argentina para una fecha dada. */
function horaArgentina(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "numeric",
    hour12: false,
    hourCycle: "h23",
  })
  return Number(fmt.format(d))
}

/** Tipo de checklist según la hora local AR del momento de registro. */
function tipoChecklistPorHora(d: Date): TipoChecklist {
  return horaArgentina(d) < HORA_CORTE_LIBERACION ? "liberacion" : "retorno"
}

// ==================== ITEMS ====================

export async function getChecklistItems(): Promise<
  { data: ChecklistItem[] } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("active", true)
      .order("orden")
    if (error) return { error: error.message }
    return { data: (data || []) as ChecklistItem[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== CREAR CHECKLIST ====================

interface CreateChecklistInput {
  fecha: string
  dominio: string
  chofer: string
  odometro?: number
  observaciones?: string
  iniciadoEn?: string // ISO del momento en que se abrió el form
  duracionSegundos?: number // duración de llenado medida en el cliente
  respuestas: { item_id: string; valor: string; comentario?: string }[]
}

export async function createChecklist(
  input: CreateChecklistInput
): Promise<{ data: ChecklistVehiculo } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const now = new Date()
    const dominioNorm = input.dominio.trim().toUpperCase()

    // Los autoelevadores se chequean una sola vez, al inicio de la jornada (no
    // tienen checklist de retorno), así que su registro es SIEMPRE liberación sin
    // importar la hora. Para el resto, el tipo se deriva de la hora del registro
    // (mismo instante que se guarda en `hora`): antes de las 09:00 AR es salida
    // (liberación), después es entrada (retorno).
    const { data: veh } = await supabase
      .from("catalogo_vehiculos")
      .select("tipo")
      .eq("dominio", dominioNorm)
      .maybeSingle()
    const esAutoelevador = veh?.tipo === "autoelevador"
    const tipo: TipoChecklist = esAutoelevador
      ? "liberacion"
      : tipoChecklistPorHora(now)

    // Fetch items to determine criticality
    const { data: items } = await supabase
      .from("checklist_items")
      .select("id, critico")
      .eq("active", true)

    const criticosMap = new Map(
      (items || []).map((i: { id: string; critico: boolean }) => [i.id, i.critico])
    )

    // Determine resultado: if any critical item is "nook" or "malo" → rechazado
    let resultado: ResultadoChecklist = "aprobado"
    for (const r of input.respuestas) {
      const esCritico = criticosMap.get(r.item_id)
      if (esCritico && (r.valor === "nook" || r.valor === "malo")) {
        resultado = "rechazado"
        break
      }
    }

    // Calculate tiempo_ruta_minutos for retorno
    let tiempoRutaMinutos: number | null = null
    if (tipo === "retorno") {
      // Find the liberacion checklist for same vehicle + same day
      const { data: liberacion } = await supabase
        .from("checklist_vehiculos")
        .select("hora")
        .eq("tipo", "liberacion")
        .eq("dominio", dominioNorm)
        .eq("fecha", input.fecha)
        .order("hora", { ascending: false })
        .limit(1)
        .single()

      if (liberacion) {
        const horaLib = new Date(liberacion.hora).getTime()
        const horaRet = now.getTime()
        tiempoRutaMinutos = Math.round((horaRet - horaLib) / 60000)
      }
    }

    // Insert checklist header
    const { data: checklist, error: chkError } = await supabase
      .from("checklist_vehiculos")
      .insert({
        tipo,
        fecha: input.fecha,
        dominio: dominioNorm,
        chofer: input.chofer.trim().toUpperCase(),
        hora: now.toISOString(),
        resultado,
        observaciones: input.observaciones?.trim() || null,
        tiempo_ruta_minutos: tiempoRutaMinutos,
        odometro: input.odometro || null,
        iniciado_en: input.iniciadoEn || null,
        duracion_segundos: input.duracionSegundos ?? null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (chkError) return { error: chkError.message }

    // Insert responses
    const respuestasToInsert = input.respuestas.map((r) => ({
      checklist_id: checklist.id,
      item_id: r.item_id,
      valor: r.valor,
      comentario: r.comentario?.trim() || null,
    }))

    const { error: respError } = await supabase
      .from("checklist_respuestas")
      .insert(respuestasToInsert)

    if (respError) return { error: respError.message }

    return { data: checklist as ChecklistVehiculo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== LISTAR CHECKLISTS ====================

interface ChecklistFilter {
  tipo?: TipoChecklist
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
  chofer?: string
  resultado?: ResultadoChecklist
  limit?: number
}

export async function getChecklists(
  filters?: ChecklistFilter
): Promise<{ data: ChecklistVehiculo[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("checklist_vehiculos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false })

    if (filters?.tipo) query = query.eq("tipo", filters.tipo)
    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)
    if (filters?.chofer) query = query.eq("chofer", filters.chofer)
    if (filters?.resultado) query = query.eq("resultado", filters.resultado)
    if (filters?.limit) query = query.limit(filters.limit)

    const { data, error } = await query
    if (error) return { error: error.message }
    return { data: (data || []) as ChecklistVehiculo[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DETALLE CHECKLIST ====================

export async function getChecklistDetalle(
  id: string
): Promise<{ data: ChecklistVehiculoConRespuestas } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: checklist, error: chkError } = await supabase
      .from("checklist_vehiculos")
      .select("*")
      .eq("id", id)
      .single()

    if (chkError) return { error: chkError.message }

    const { data: respuestas, error: respError } = await supabase
      .from("checklist_respuestas")
      .select("*, item:checklist_items(*)")
      .eq("checklist_id", id)
      .order("created_at")

    if (respError) return { error: respError.message }

    return {
      data: {
        ...checklist,
        respuestas: respuestas || [],
      } as ChecklistVehiculoConRespuestas,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DELETE CHECKLIST ====================

interface UpdateChecklistInput {
  id: string
  fecha: string
  dominio: string
  chofer: string
  hora: string // HH:MM local → se combina con fecha
  resultado: ResultadoChecklist
  odometro?: number | null
  observaciones?: string | null
  tipo?: TipoChecklist // corrección manual (superv/admin) del tipo salida/entrada
}

export async function updateChecklist(
  input: UpdateChecklistInput,
): Promise<{ data: ChecklistVehiculo } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const horaIso = new Date(`${input.fecha}T${input.hora}:00`).toISOString()
    const dominio = input.dominio.trim().toUpperCase()

    const updateFields: Record<string, unknown> = {
      fecha: input.fecha,
      dominio,
      chofer: input.chofer.trim().toUpperCase(),
      hora: horaIso,
      resultado: input.resultado,
      odometro: input.odometro ?? null,
      observaciones: input.observaciones?.trim() || null,
    }

    // Si se corrige el tipo, recalcular el tiempo en ruta para que no quede
    // incoherente: una liberación no tiene tiempo en ruta; un retorno se mide
    // contra la liberación del mismo vehículo y día.
    if (input.tipo) {
      updateFields.tipo = input.tipo
      if (input.tipo === "liberacion") {
        updateFields.tiempo_ruta_minutos = null
      } else {
        const { data: liberacion } = await supabase
          .from("checklist_vehiculos")
          .select("hora")
          .eq("tipo", "liberacion")
          .eq("dominio", dominio)
          .eq("fecha", input.fecha)
          .neq("id", input.id)
          .order("hora", { ascending: false })
          .limit(1)
          .single()
        updateFields.tiempo_ruta_minutos = liberacion
          ? Math.round(
              (new Date(horaIso).getTime() -
                new Date(liberacion.hora).getTime()) /
                60000,
            )
          : null
      }
    }

    const { data, error } = await supabase
      .from("checklist_vehiculos")
      .update(updateFields)
      .eq("id", input.id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: data as ChecklistVehiculo }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteChecklist(
  id: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { error } = await supabase
      .from("checklist_vehiculos")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== ESTADO VEHÍCULOS HOY ====================

export async function getEstadoVehiculosHoy(): Promise<
  {
    data: {
      dominio: string
      descripcion: string | null
      estado: "en_base" | "en_ruta" | "retornado"
      ultimoChecklist: ChecklistVehiculo | null
    }[]
  } | { error: string }
> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // Get all active vehicles
    const { data: vehiculos, error: vehError } = await supabase
      .from("catalogo_vehiculos")
      .select("dominio, descripcion")
      .eq("active", true)
      .order("dominio")

    if (vehError) return { error: vehError.message }

    // Get today's checklists
    const hoy = new Date().toISOString().slice(0, 10)
    const { data: checklistsHoy, error: chkError } = await supabase
      .from("checklist_vehiculos")
      .select("*")
      .eq("fecha", hoy)
      .order("hora", { ascending: false })

    if (chkError) return { error: chkError.message }

    const checklists = (checklistsHoy || []) as ChecklistVehiculo[]

    const result = (vehiculos || []).map((v: { dominio: string; descripcion: string | null }) => {
      const vehiculoChecklists = checklists.filter(
        (c) => c.dominio === v.dominio
      )
      const tieneRetorno = vehiculoChecklists.some((c) => c.tipo === "retorno")
      const tieneLiberacion = vehiculoChecklists.some(
        (c) => c.tipo === "liberacion"
      )

      let estado: "en_base" | "en_ruta" | "retornado" = "en_base"
      if (tieneRetorno) estado = "retornado"
      else if (tieneLiberacion) estado = "en_ruta"

      return {
        dominio: v.dominio,
        descripcion: v.descripcion,
        estado,
        ultimoChecklist: vehiculoChecklists[0] || null,
      }
    })

    return { data: result }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== KPIs TIEMPO EN RUTA ====================

export async function getTiempoRutaKpis(filters?: {
  fechaDesde?: string
  fechaHasta?: string
  dominio?: string
}): Promise<{
  data: {
    totalRetornos: number
    promedioMinutos: number
    promedioHoras: string
    dentroMeta: number
    pctDentroMeta: number
    metaMinutos: number
    semanal: TiempoRutaSemanal[]
    mensual: TiempoRutaMensual[]
  }
} | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    let query = supabase
      .from("checklist_vehiculos")
      .select("*")
      .eq("tipo", "retorno")
      .not("tiempo_ruta_minutos", "is", null)
      .order("fecha", { ascending: true })

    if (filters?.fechaDesde) query = query.gte("fecha", filters.fechaDesde)
    if (filters?.fechaHasta) query = query.lte("fecha", filters.fechaHasta)
    if (filters?.dominio) query = query.eq("dominio", filters.dominio)

    const { data, error } = await query
    if (error) return { error: error.message }

    const registros = (data || []) as ChecklistVehiculo[]

    if (registros.length === 0) {
      return {
        data: {
          totalRetornos: 0,
          promedioMinutos: 0,
          promedioHoras: "0:00",
          dentroMeta: 0,
          pctDentroMeta: 0,
          metaMinutos: TIEMPO_RUTA_META_MINUTOS,
          semanal: [],
          mensual: [],
        },
      }
    }

    const tiempos = registros.map((r) => r.tiempo_ruta_minutos!)
    const totalRetornos = tiempos.length
    const promedioMinutos = Math.round(
      tiempos.reduce((a, b) => a + b, 0) / totalRetornos
    )
    const hh = Math.floor(promedioMinutos / 60)
    const mm = promedioMinutos % 60
    const promedioHoras = `${hh}:${mm.toString().padStart(2, "0")}`
    const dentroMeta = tiempos.filter(
      (t) => t <= TIEMPO_RUTA_META_MINUTOS
    ).length
    const pctDentroMeta = Math.round((dentroMeta / totalRetornos) * 100)

    // Group by week
    const semanalMap = new Map<
      string,
      { tiempos: number[]; year: number; semana: number }
    >()
    for (const r of registros) {
      const date = new Date(r.fecha + "T12:00:00")
      const startOfYear = new Date(date.getFullYear(), 0, 1)
      const diff = date.getTime() - startOfYear.getTime()
      const semana = Math.ceil(
        (diff / 86400000 + startOfYear.getDay() + 1) / 7
      )
      const year = date.getFullYear()
      const key = `${year}-${semana}`
      if (!semanalMap.has(key))
        semanalMap.set(key, { tiempos: [], year, semana })
      semanalMap.get(key)!.tiempos.push(r.tiempo_ruta_minutos!)
    }
    const semanal: TiempoRutaSemanal[] = Array.from(
      semanalMap.values()
    ).map((g) => {
      const dm = g.tiempos.filter(
        (t) => t <= TIEMPO_RUTA_META_MINUTOS
      ).length
      return {
        semana: g.semana,
        year: g.year,
        promedio_minutos: Math.round(
          g.tiempos.reduce((a, b) => a + b, 0) / g.tiempos.length
        ),
        total_retornos: g.tiempos.length,
        dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tiempos.length) * 100),
      }
    })

    // Group by month
    const mensualMap = new Map<
      string,
      { tiempos: number[]; year: number; mes: number }
    >()
    for (const r of registros) {
      const d = new Date(r.fecha + "T12:00:00")
      const year = d.getFullYear()
      const mes = d.getMonth() + 1
      const key = `${year}-${mes}`
      if (!mensualMap.has(key))
        mensualMap.set(key, { tiempos: [], year, mes })
      mensualMap.get(key)!.tiempos.push(r.tiempo_ruta_minutos!)
    }
    const mensual: TiempoRutaMensual[] = Array.from(
      mensualMap.values()
    ).map((g) => {
      const dm = g.tiempos.filter(
        (t) => t <= TIEMPO_RUTA_META_MINUTOS
      ).length
      return {
        mes: g.mes,
        year: g.year,
        promedio_minutos: Math.round(
          g.tiempos.reduce((a, b) => a + b, 0) / g.tiempos.length
        ),
        total_retornos: g.tiempos.length,
        dentro_meta: dm,
        pct_dentro_meta: Math.round((dm / g.tiempos.length) * 100),
      }
    })

    return {
      data: {
        totalRetornos,
        promedioMinutos,
        promedioHoras,
        dentroMeta,
        pctDentroMeta,
        metaMinutos: TIEMPO_RUTA_META_MINUTOS,
        semanal,
        mensual,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

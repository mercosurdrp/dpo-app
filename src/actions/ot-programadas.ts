"use server"

// Programación semanal de órdenes de trabajo (DPO Flota 2.2/2.4): lo que el
// Supervisor de Flota planea hacerle a cada unidad, con registro histórico y
// PDF imprimible para entregarle al taller/mecánico.

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { createMantenimiento, updateMantenimiento } from "@/actions/mantenimiento-vehiculos"
import type { MantenimientoTipo } from "@/types/database"

export type OtProgramadaEstado =
  | "planificada"
  | "enviada"
  | "en_taller"
  | "realizada"
  | "cancelada"

export interface OtProgramada {
  id: string
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller: string
  notas: string
  estado: OtProgramadaEstado
  realizado_id: string | null
  created_at: string
  updated_at: string
  /** N° de la orden de trabajo, una vez creada. */
  ot_numero?: string | null
  /** Día en que se cerró (salida del taller): hasta dónde llega en el calendario. */
  ot_cierre?: string | null
  /** Kilometraje ya cargado en la OT, para no volver a tipearlo al cerrarla. */
  ot_odometro?: number | null
  /** Horómetro ya cargado en la OT (autoelevadores). */
  ot_horometro?: number | null
}

type Result<T> = { data: T } | { error: string }

function normalizarTareas(tareas: string[]): string[] {
  return tareas.map((t) => t.trim()).filter(Boolean)
}

/**
 * Fecha + hora del taller en un timestamp con la zona de Argentina.
 *
 * 🚨 `entrada_taller` y `salida_taller` son `timestamptz`: mandar "2026-08-13T14:30"
 * pelado hace que Postgres lo lea como UTC y el horario se muestre tres horas
 * corrido. Acá no hay horario de verano, así que el offset es fijo.
 *
 * Sin hora se guarda la fecha sola, como venía haciéndose hasta ahora.
 */
function conHora(fecha: string, hora?: string | null): string {
  const hhmm = (hora ?? "").trim()
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return fecha
  return `${fecha}T${hhmm}:00-03:00`
}

/**
 * Le suma a cada orden programada el N° de su orden de trabajo y el día en que
 * se cerró.
 *
 * El número es lo que la gente usa para hablar de una orden ("la 1756"), así que
 * tiene que verse en todas las pantallas, no sólo en Órdenes de Trabajo. El
 * cierre es hasta dónde llega la barra del calendario: una orden abierta el 10 y
 * cerrada el 10 ocupa un día, no una semana.
 *
 * Va en una segunda consulta y no en un embed: `realizado_id` no tiene FK
 * declarada, así que PostgREST no lo puede embeber.
 */
async function conDatosDeLaOt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ots: OtProgramada[]
): Promise<OtProgramada[]> {
  const ids = ots.map((o) => o.realizado_id).filter((id): id is string => !!id)
  if (ids.length === 0) return ots
  const { data, error } = await supabase
    .from("mantenimiento_realizados")
    .select("id,numero_ot,fecha,salida_taller,odometro,horometro")
    .in("id", ids)
  if (error || !data) return ots
  const porId = new Map(data.map((r) => [r.id as string, r]))
  return ots.map((o) => {
    const r = o.realizado_id ? porId.get(o.realizado_id) : null
    if (!r) return o
    return {
      ...o,
      ot_numero: (r.numero_ot as string | null) ?? null,
      // Sin salida cargada, el cierre es el día de la OT: mejor eso que dejar la
      // barra abierta hasta hoy en una orden que ya está resuelta.
      ot_cierre:
        ((r.salida_taller as string | null) ?? (r.fecha as string | null))?.slice(0, 10) ?? null,
      ot_odometro: (r.odometro as number | null) ?? null,
      ot_horometro: (r.horometro as number | null) ?? null,
    }
  })
}

export async function getOtProgramadas(rango: {
  desde: string
  hasta: string
}): Promise<Result<OtProgramada[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .gte("fecha_programada", rango.desde)
      .lte("fecha_programada", rango.hasta)
      .order("fecha_programada")
      .order("dominio")
    if (error) return { error: error.message }
    return { data: await conDatosDeLaOt(supabase, (data || []) as OtProgramada[]) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function createOtProgramada(input: {
  dominio: string
  fecha_programada: string
  tareas: string[]
  taller?: string
  notas?: string
}): Promise<Result<OtProgramada>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const tareas = normalizarTareas(input.tareas)
    if (!input.dominio || !input.fecha_programada) {
      return { error: "Faltan unidad o fecha" }
    }
    if (tareas.length === 0) return { error: "Cargá al menos un trabajo a realizar" }
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .insert({
        dominio: input.dominio,
        fecha_programada: input.fecha_programada,
        tareas,
        taller: input.taller?.trim() ?? "",
        notas: input.notas?.trim() ?? "",
        created_by: profile.id,
      })
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function updateOtProgramada(input: {
  id: string
  fecha_programada?: string
  tareas?: string[]
  taller?: string
  notas?: string
  estado?: OtProgramadaEstado
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const update: Record<string, unknown> = {}
    if (input.fecha_programada) update.fecha_programada = input.fecha_programada
    if (input.tareas) {
      const tareas = normalizarTareas(input.tareas)
      if (tareas.length === 0) return { error: "Cargá al menos un trabajo a realizar" }
      update.tareas = tareas
    }
    if (input.taller !== undefined) update.taller = input.taller.trim()
    if (input.notas !== undefined) update.notas = input.notas.trim()
    if (input.estado) update.estado = input.estado
    const { data, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .update(update)
      .eq("id", input.id)
      .select("*")
      .single()
    if (error) return { error: error.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

// ==================== DE LA PROGRAMACIÓN A LA OT REAL ====================
//
// Antes había que cargar todo dos veces: la orden programada y después, a mano,
// la orden de trabajo realizada con los mismos datos. Ahora la programada ES la
// OT: cuando la unidad se lleva al taller se crea la orden real en estado
// "en taller" (queda fuera de servicio desde ese día), y cuando vuelve se cierra
// con el kilometraje, el costo y la factura.

/**
 * La unidad se llevó al taller: crea la OT real a partir de la programada y las
 * deja vinculadas (`realizado_id`).
 *
 * `tareaIds` son las tareas del PLAN preventivo que se van a hacer: sin ellas el
 * mantenimiento no descuenta del plan y el service sigue figurando pendiente.
 * Los trabajos que no están en el plan viajan como descripción libre.
 */
export async function llevarOtAlTaller(input: {
  id: string
  fecha: string
  /** Hora de entrada al taller, "HH:MM". Opcional. */
  hora?: string
  tipo: MantenimientoTipo
  tareaIds?: string[]
  /** Nombre del plan de cada tarea elegida, para no repetirla como texto libre. */
  nombresDelPlan?: string[]
  odometro?: number | null
  horometro?: number | null
  /** Service general (rodado): reinicia el contador del próximo service. */
  esServiceGeneral?: boolean
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: prog, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .eq("id", input.id)
      .single()
    if (error || !prog) return { error: error?.message ?? "No se encontró la orden programada" }
    const ot = prog as OtProgramada
    if (ot.realizado_id) return { error: "Esta orden ya tiene una OT de trabajo asociada" }

    const delPlan = new Set((input.nombresDelPlan ?? []).map((n) => n.trim()))
    const tareas = [
      ...(input.tareaIds ?? []).map((tareaId) => ({ tareaId })),
      ...normalizarTareas(ot.tareas)
        .filter((t) => !delPlan.has(t))
        .map((descripcion) => ({ descripcion })),
      ...(input.esServiceGeneral ? [{ descripcion: "Service general (rodado)" }] : []),
    ]
    if (tareas.length === 0) return { error: "La orden no tiene trabajos cargados" }

    const res = await createMantenimiento({
      dominio: ot.dominio,
      fecha: input.fecha,
      tipo: input.tipo,
      estado: "en_taller",
      entrada_taller: conHora(input.fecha, input.hora),
      odometro: input.odometro ?? null,
      horometro: input.horometro ?? null,
      taller: ot.taller || undefined,
      observaciones: ot.notas || undefined,
      es_service_general: input.esServiceGeneral ?? false,
      tareas,
    })
    if ("error" in res) return { error: res.error }

    const { data, error: upErr } = await supabase
      .from("mantenimiento_ot_programadas")
      .update({ estado: "en_taller", realizado_id: res.data.id })
      .eq("id", input.id)
      .select("*")
      .single()
    if (upErr) return { error: upErr.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * La plata de la OT sale de los comprobantes, no de campos sueltos.
 *
 * El costo es la SUMA de los montos cargados y el N° de factura el del primer
 * comprobante que tenga uno (la grilla de Órdenes de Trabajo, el detalle, el PDF
 * y el export lo siguen leyendo de `numero_factura`, así que no puede quedar en
 * null).
 *
 * 🚨 Si no hay montos devuelve `costo: undefined` y el cierre NO toca el costo
 * que la OT ya tenía: `costo` es lo que alimenta el costo de flota (DPO 3.2) y
 * pisarlo con 0 porque alguien cerró sin cargar la factura rompería el número.
 */
function plataDeLosComprobantes(facturas?: ComprobanteInput[]): {
  costo?: number
  numero_factura?: string
} {
  const filas = facturas ?? []
  const montos = filas
    .map((f) => f.montoTotal)
    .filter((m): m is number => typeof m === "number" && isFinite(m))
  const total = montos.reduce((a, m) => a + m, 0)
  const numero = filas.map((f) => f.numero?.trim()).find((n) => !!n)
  return {
    ...(total > 0 ? { costo: Math.round(total * 100) / 100 } : {}),
    ...(numero ? { numero_factura: numero } : {}),
  }
}

/**
 * Volvió la unidad: cierra la OT real (pasa a completada y vuelve a servicio) y
 * marca la programada como realizada. Acá recién se cargan el kilometraje de
 * salida y los comprobantes, de donde salen el costo y el N° de factura.
 */
export async function cerrarOtProgramada(input: {
  id: string
  fechaSalida: string
  /** Hora en que se resolvió y volvió la unidad, "HH:MM". Opcional. */
  horaSalida?: string
  odometro?: number | null
  horometro?: number | null
  observaciones?: string
  /**
   * Comprobantes con su adjunto: la del mecánico y la de repuestos van
   * separadas. Es la ÚNICA fuente del costo y del N° de factura de la OT.
   */
  facturas?: ComprobanteInput[]
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: prog, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .eq("id", input.id)
      .single()
    if (error || !prog) return { error: error?.message ?? "No se encontró la orden programada" }
    const ot = prog as OtProgramada
    if (!ot.realizado_id) {
      return { error: "La orden todavía no se llevó al taller: no hay OT que cerrar" }
    }

    const adjuntos = (input.facturas ?? [])
      .map((f) => f.adjuntoUrl)
      .filter((u): u is string => !!u)
    const plata = plataDeLosComprobantes(input.facturas)

    const res = await updateMantenimiento({
      id: ot.realizado_id,
      estado: "completado",
      salida_taller: conHora(input.fechaSalida, input.horaSalida),
      ...(input.facturas?.length ? { facturas: input.facturas } : {}),
      // Las URLs también van a `evidencia_urls`: es lo que lee la grilla de
      // Órdenes de Trabajo y las OT viejas, así el adjunto se ve en todos lados.
      // Sólo se toca si vino alguna foto: mandar [] borraría las que ya estaban.
      ...(adjuntos.length > 0 ? { evidencia_urls: adjuntos } : {}),
      // El odómetro de la salida es el que usa el plan para contar el próximo
      // vencimiento: sin él la tarea queda hecha pero sin kilometraje de corte.
      ...(input.odometro != null ? { odometro: input.odometro } : {}),
      ...(input.horometro != null ? { horometro: input.horometro } : {}),
      // Costo y N° de factura salen de los comprobantes; sin montos no se toca
      // lo que la OT ya tenía (ver `plataDeLosComprobantes`).
      ...(plata.costo != null ? { costo: plata.costo } : {}),
      ...(plata.numero_factura ? { numero_factura: plata.numero_factura } : {}),
      ...(input.observaciones ? { observaciones: input.observaciones } : {}),
    })
    if ("error" in res) return { error: res.error }

    const { data, error: upErr } = await supabase
      .from("mantenimiento_ot_programadas")
      .update({ estado: "realizada" })
      .eq("id", input.id)
      .select("*")
      .single()
    if (upErr) return { error: upErr.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function deleteOtProgramada(id: string): Promise<
  { success: true } | { error: string }
> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()
    const { error } = await supabase
      .from("mantenimiento_ot_programadas")
      .delete()
      .eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Comprobante de la OT: el mecánico y el proveedor de repuestos facturan por
 * separado, así que cada uno va con su adjunto.
 */
export interface ComprobanteInput {
  proveedor?: string | null
  numero?: string | null
  montoTotal?: number | null
  adjuntoUrl?: string | null
}

/**
 * El trabajo se hizo y ya está: crea la orden de trabajo y la cierra de una,
 * sin pasar por "está en el taller".
 *
 * Es el caso de todos los días —la unidad va a la gomería, la traen a la tarde y
 * el trabajo está resuelto— y también el de la orden que se cargó, se resolvió y
 * nadie tocó los botones: obligar a marcar primero la entrada al taller para
 * poder cerrarla es papeleo que nadie va a hacer.
 */
export async function resolverOtProgramada(input: {
  id: string
  /** Día en que se hizo el trabajo. */
  fecha: string
  /** Hora en que entró al taller, "HH:MM". Opcional. */
  hora?: string
  /** Hora en que quedó resuelto, "HH:MM". Opcional. */
  horaSalida?: string
  tipo: MantenimientoTipo
  tareaIds?: string[]
  nombresDelPlan?: string[]
  odometro?: number | null
  horometro?: number | null
  esServiceGeneral?: boolean
  observaciones?: string
  /** Única fuente del costo y del N° de factura de la OT. */
  facturas?: ComprobanteInput[]
}): Promise<Result<OtProgramada>> {
  const abierta = await llevarOtAlTaller({
    id: input.id,
    fecha: input.fecha,
    hora: input.hora,
    tipo: input.tipo,
    tareaIds: input.tareaIds,
    nombresDelPlan: input.nombresDelPlan,
    odometro: input.odometro,
    horometro: input.horometro,
    esServiceGeneral: input.esServiceGeneral,
  })
  if ("error" in abierta) return abierta

  // Si el cierre falla, la orden queda "en taller" con su OT ya creada: se
  // cierra después desde la misma pantalla, sin cargar nada dos veces.
  return cerrarOtProgramada({
    id: input.id,
    fechaSalida: input.fecha,
    horaSalida: input.horaSalida,
    odometro: input.odometro,
    horometro: input.horometro,
    observaciones: input.observaciones,
    facturas: input.facturas,
  })
}

export interface OtCandidata {
  id: string
  numero_ot: string | null
  fecha: string
  estado: string | null
  taller: string | null
  costo: number | null
}

/**
 * Órdenes de trabajo YA cargadas que podrían ser esta orden programada.
 *
 * Hasta que existió el circuito programada → OT, las dos cosas se cargaban por
 * separado: la programada quedaba "planificada" para siempre y el trabajo vivía
 * en Órdenes de Trabajo sin vínculo. Esto permite juntarlas en vez de crear una
 * OT repetida.
 */
export async function getOtCandidatasParaVincular(
  id: string
): Promise<Result<OtCandidata[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: prog, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .eq("id", id)
      .single()
    if (error || !prog) return { error: error?.message ?? "No se encontró la orden programada" }
    const ot = prog as OtProgramada

    const desde = new Date(`${ot.fecha_programada}T00:00:00`)
    desde.setDate(desde.getDate() - 15)
    const hasta = new Date(`${ot.fecha_programada}T00:00:00`)
    hasta.setDate(hasta.getDate() + 30)
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const { data, error: errOt } = await supabase
      .from("mantenimiento_realizados")
      .select("id,numero_ot,fecha,estado,taller,costo")
      .eq("dominio", ot.dominio)
      .gte("fecha", iso(desde))
      .lte("fecha", iso(hasta))
      .order("fecha")
    if (errOt) return { error: errOt.message }

    // Las que ya están atadas a otra orden programada no se ofrecen.
    const { data: tomadas } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("realizado_id")
      .not("realizado_id", "is", null)
    const usadas = new Set((tomadas ?? []).map((t) => t.realizado_id as string))

    return { data: ((data ?? []) as OtCandidata[]).filter((c) => !usadas.has(c.id)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Ata la orden programada a una OT que ya estaba cargada, sin crear nada nuevo.
 * El estado sale del de la OT: si está completada, la programada queda resuelta.
 */
export async function vincularOtProgramada(input: {
  id: string
  realizadoId: string
}): Promise<Result<OtProgramada>> {
  try {
    await requireRole(["admin", "supervisor"])
    const supabase = await createClient()

    const { data: prog, error } = await supabase
      .from("mantenimiento_ot_programadas")
      .select("*")
      .eq("id", input.id)
      .single()
    if (error || !prog) return { error: error?.message ?? "No se encontró la orden programada" }
    if ((prog as OtProgramada).realizado_id) {
      return { error: "Esta orden ya tiene una OT de trabajo asociada" }
    }

    const { data: real, error: errOt } = await supabase
      .from("mantenimiento_realizados")
      .select("id,dominio,estado")
      .eq("id", input.realizadoId)
      .single()
    if (errOt || !real) return { error: errOt?.message ?? "No se encontró la orden de trabajo" }
    if (real.dominio !== (prog as OtProgramada).dominio) {
      return { error: "Esa orden de trabajo es de otra unidad" }
    }

    const { data, error: upErr } = await supabase
      .from("mantenimiento_ot_programadas")
      .update({
        realizado_id: input.realizadoId,
        estado: real.estado === "completado" ? "realizada" : "en_taller",
      })
      .eq("id", input.id)
      .select("*")
      .single()
    if (upErr) return { error: upErr.message }
    return { data: data as OtProgramada }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

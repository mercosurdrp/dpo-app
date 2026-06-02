"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  SLA_RUTEO_NOMBRE,
  SLA_RUTEO_TARGET,
  SLA_SYOP_NOMBRE,
  SLA_SYOP_TARGET,
  SLA_CAPACIDAD_NOMBRE,
  SLA_CAPACIDAD_TARGET,
  SLA_PUSHED_NOMBRE,
  SLA_PUSHED_TARGET,
  CAPACIDAD_MIN_PCT,
  PUSHED_MAX_PCT,
  type CumplimientoMes,
  type CumplimientoSlaFila,
  type EstadoCumplimiento,
} from "@/lib/sla-cumplimiento"
import type { SlaAdjunto, SlaConAutor, SlaEstado } from "@/types/database"

const DASHBOARD_PATH = "/sla"
const BUCKET = "sla"
const ROLES_GESTION = ["admin", "supervisor"] as const

type Result<T> = { data: T } | { error: string }

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Lista todos los SLA (con sus adjuntos y URL pública), ordenados por pilar/orden.
 * Lectura para cualquier usuario autenticado.
 */
export async function getSlas(): Promise<Result<SlaConAutor[]>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: slas, error } = await supabase
      .from("slas")
      .select("*")
      .order("orden", { ascending: true })
    if (error) return { error: error.message }

    const { data: adjuntos, error: errAdj } = await supabase
      .from("sla_adjuntos")
      .select("*")
      .order("created_at", { ascending: false })
    if (errAdj) return { error: errAdj.message }

    const today = hoyISO()
    const adjuntosPorSla = new Map<string, SlaAdjunto[]>()
    for (const a of (adjuntos ?? []) as any[]) {
      const url = supabase.storage.from(BUCKET).getPublicUrl(a.storage_path).data
        .publicUrl
      const item: SlaAdjunto = { ...(a as SlaAdjunto), url }
      const list = adjuntosPorSla.get(a.sla_id) ?? []
      list.push(item)
      adjuntosPorSla.set(a.sla_id, list)
    }

    const enriched: SlaConAutor[] = ((slas ?? []) as any[]).map((s) => ({
      ...(s as any),
      adjuntos: adjuntosPorSla.get(s.id) ?? [],
      vencido:
        s.estado !== "no_aplica" &&
        !!s.fecha_vencimiento &&
        s.fecha_vencimiento < today,
    }))

    return { data: enriched }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando los SLA",
    }
  }
}

interface UpdateSlaInput {
  estado?: SlaEstado
  fecha_firma?: string | null
  fecha_vencimiento?: string | null
  notas?: string | null
  parte_cliente?: string | null
  parte_proveedor?: string | null
  descripcion?: string | null
}

/**
 * Edita los metadatos editables de un SLA. Solo admin/supervisor.
 * No toca codigo/nombre/pilar/es_predefinido (la lista es fija).
 */
export async function updateSla(
  id: string,
  input: UpdateSlaInput,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden editar un SLA." }
    }
    const supabase = await createClient()

    const fields: Record<string, unknown> = {}
    if (input.estado !== undefined) fields.estado = input.estado
    if (input.fecha_firma !== undefined) fields.fecha_firma = input.fecha_firma
    if (input.fecha_vencimiento !== undefined)
      fields.fecha_vencimiento = input.fecha_vencimiento
    if (input.notas !== undefined) fields.notas = input.notas
    if (input.parte_cliente !== undefined)
      fields.parte_cliente = input.parte_cliente
    if (input.parte_proveedor !== undefined)
      fields.parte_proveedor = input.parte_proveedor
    if (input.descripcion !== undefined) fields.descripcion = input.descripcion

    if (Object.keys(fields).length === 0) return { data: { id } }

    const { error } = await supabase.from("slas").update(fields).eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error editando el SLA",
    }
  }
}

interface AdjuntoInput {
  storage_path: string
  nombre_original: string
  mime_type: string
  tamano_bytes: number
}

/**
 * Registra el acuerdo firmado (adjunto ya subido a Storage por el cliente).
 * Si el SLA estaba "pendiente", pasa a "firmado" y se completa la fecha de
 * firma con hoy si no tenía. Solo admin/supervisor.
 */
export async function addSlaAdjunto(
  slaId: string,
  adjunto: AdjuntoInput,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden cargar acuerdos." }
    }
    const supabase = await createClient()

    const { data: inserted, error } = await supabase
      .from("sla_adjuntos")
      .insert({
        sla_id: slaId,
        storage_path: adjunto.storage_path,
        nombre_original: adjunto.nombre_original,
        mime_type: adjunto.mime_type,
        "tamaño_bytes": adjunto.tamano_bytes,
        subido_por: profile.id,
      })
      .select("id")
      .single()

    if (error || !inserted) {
      // rollback del archivo huérfano
      await supabase.storage.from(BUCKET).remove([adjunto.storage_path])
      return { error: error?.message ?? "No se pudo registrar el acuerdo" }
    }

    // Auto-estado: si estaba pendiente, marcar firmado + fecha de firma.
    const { data: sla } = await supabase
      .from("slas")
      .select("estado, fecha_firma")
      .eq("id", slaId)
      .single()
    if (sla && (sla as any).estado === "pendiente") {
      await supabase
        .from("slas")
        .update({
          estado: "firmado",
          fecha_firma: (sla as any).fecha_firma ?? hoyISO(),
        })
        .eq("id", slaId)
    }

    revalidatePath(DASHBOARD_PATH)
    return { data: { id: inserted.id as string } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el acuerdo",
    }
  }
}

/**
 * Borra un acuerdo (archivo + registro). Solo admin/supervisor.
 */
export async function deleteSlaAdjunto(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden borrar acuerdos." }
    }
    const supabase = await createClient()

    const { data: adj } = await supabase
      .from("sla_adjuntos")
      .select("storage_path")
      .eq("id", id)
      .single()

    const { error } = await supabase.from("sla_adjuntos").delete().eq("id", id)
    if (error) return { error: error.message }

    if (adj?.storage_path) {
      await supabase.storage.from(BUCKET).remove([adj.storage_path as string])
    }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando el acuerdo",
    }
  }
}

// ===========================================================================
// Cumplimiento del SLA "Tiempo de finalización del ruteo" (plan_ruteo_tiempo)
// ---------------------------------------------------------------------------
// Mide, día a día, si el ruteo cerró dentro de la ventana pactada:
//   • Lunes a viernes → antes de las 09:00 hs
//   • Sábados         → antes de las 07:30 hs
//   • Domingos        → no aplica
// Fuente: ruteo_cierres.hora_fin (timestamp real del clic "Fin de ruteo").
// 🚨 hora_fin se guarda en UTC; Argentina es UTC-3 fijo (sin DST), así que
// el límite de 09:00 ARG = 12:00 UTC. La conversión vive en este módulo.
// Pampeana-only: ruteo_cierres no existe en la Supabase de Misiones.
// ===========================================================================

/** Día de semana (0=Dom..6=Sáb) de un 'YYYY-MM-DD' sin corrimiento por TZ. */
function dowFromISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Límite del fin de RUTEO (min desde medianoche ARG), o null si no aplica. */
function limiteMinutos(dow: number): number | null {
  if (dow === 0) return null // domingo: no se rutea
  if (dow === 6) return 7 * 60 + 30 // sábado 07:30
  return 9 * 60 // L-V 09:00
}

/** Límite de ENTREGA DE PREVENTA (min desde medianoche ARG), o null si no aplica. */
function limitePreventa(dow: number): number | null {
  if (dow === 0) return null // domingo: no hay preventa
  if (dow === 6) return 7 * 60 // sábado 07:00
  return 8 * 60 // L-V 08:00
}

/** Minutos desde medianoche en hora ARG (UTC-3) de un timestamp UTC. */
function minutosARG(iso: string): number {
  const d = new Date(iso)
  let mins = d.getUTCHours() * 60 + d.getUTCMinutes() - 180
  if (mins < 0) mins += 1440
  return mins
}

/** Fila de cumplimiento del SLA de tiempo de ruteo (`plan_ruteo_tiempo`). */
async function filaRuteo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  diasDelMes: number,
): Promise<CumplimientoSlaFila> {
  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  const hastaExcl =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("ruteo_cierres")
    .select("fecha, hora_fin")
    .gte("fecha", desde)
    .lt("fecha", hastaExcl)

  // día (1..N) → hora_fin ISO (o null si el ruteo no cerró)
  const finPorDia = new Map<number, string | null>()
  for (const row of (data ?? []) as any[]) {
    const dia = Number((row.fecha as string).slice(8, 10))
    finPorDia.set(dia, (row.hora_fin as string | null) ?? null)
  }

  const dias: EstadoCumplimiento[] = []
  let totalAplica = 0
  let cumplidos = 0

  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    const limMin = limiteMinutos(dowFromISO(iso))
    if (limMin === null) {
      dias.push("na") // domingo: no aplica
      continue
    }
    const horaFin = finPorDia.get(d)
    if (horaFin == null) {
      dias.push("sd") // sin ruteo registrado / no cerrado / futuro
      continue
    }
    const cumple = minutosARG(horaFin) <= limMin
    totalAplica++
    if (cumple) cumplidos++
    dias.push(cumple ? "si" : "no")
  }

  const porcentaje =
    totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null

  return {
    codigo: "plan_ruteo_tiempo",
    nombre: SLA_RUTEO_NOMBRE,
    target: SLA_RUTEO_TARGET,
    porcentaje,
    cumplidos,
    totalAplica,
    dias,
  }
}

/**
 * Fila de cumplimiento del SLA Ventas↔Operaciones (`plan_syop`), medido por el
 * horario de entrega de preventa a Ruteo (`ruteo_cierres.hora_fin_preventa`):
 * L-V antes de 08:00 · sábados antes de 07:00.
 */
async function filaSyop(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  diasDelMes: number,
): Promise<CumplimientoSlaFila> {
  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  const hastaExcl =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("ruteo_cierres")
    .select("fecha, hora_fin_preventa")
    .gte("fecha", desde)
    .lt("fecha", hastaExcl)

  const finPorDia = new Map<number, string | null>()
  for (const row of (data ?? []) as any[]) {
    const dia = Number((row.fecha as string).slice(8, 10))
    finPorDia.set(dia, (row.hora_fin_preventa as string | null) ?? null)
  }

  const dias: EstadoCumplimiento[] = []
  let totalAplica = 0
  let cumplidos = 0

  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    const limMin = limitePreventa(dowFromISO(iso))
    if (limMin === null) {
      dias.push("na")
      continue
    }
    const hora = finPorDia.get(d)
    if (hora == null) {
      dias.push("sd")
      continue
    }
    const cumple = minutosARG(hora) <= limMin
    totalAplica++
    if (cumple) cumplidos++
    dias.push(cumple ? "si" : "no")
  }

  const porcentaje =
    totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null

  return {
    codigo: "plan_syop",
    nombre: SLA_SYOP_NOMBRE,
    target: SLA_SYOP_TARGET,
    porcentaje,
    cumplidos,
    totalAplica,
    dias,
  }
}

/**
 * Fila del SLA de capacidad del camión (`plan_ruteo_capacidad`), medido por el
 * % de ocupación promedio del día desde ocupacion_bodega_diaria (CEq/450*100).
 * Un día cumple si el promedio de las patentes ≥ CAPACIDAD_MIN_PCT.
 */
async function filaCapacidad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  diasDelMes: number,
): Promise<CumplimientoSlaFila> {
  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  const hastaExcl =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("ocupacion_bodega_diaria")
    .select("fecha, ob_pct_target")
    .gte("fecha", desde)
    .lt("fecha", hastaExcl)

  // día → acumulador para promediar ob_pct_target de las patentes del día
  const acc = new Map<number, { suma: number; n: number }>()
  for (const row of (data ?? []) as any[]) {
    const dia = Number((row.fecha as string).slice(8, 10))
    const pct = Number(row.ob_pct_target ?? 0)
    const a = acc.get(dia) ?? { suma: 0, n: 0 }
    a.suma += pct
    a.n += 1
    acc.set(dia, a)
  }

  const dias: EstadoCumplimiento[] = []
  let totalAplica = 0
  let cumplidos = 0

  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (dowFromISO(iso) === 0) {
      dias.push("na") // domingo: no se reparte
      continue
    }
    const a = acc.get(d)
    if (!a || a.n === 0) {
      dias.push("sd")
      continue
    }
    const cumple = a.suma / a.n >= CAPACIDAD_MIN_PCT
    totalAplica++
    if (cumple) cumplidos++
    dias.push(cumple ? "si" : "no")
  }

  const porcentaje =
    totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null

  return {
    codigo: "plan_ruteo_capacidad",
    nombre: SLA_CAPACIDAD_NOMBRE,
    target: SLA_CAPACIDAD_TARGET,
    porcentaje,
    cumplidos,
    totalAplica,
    dias,
  }
}

/**
 * Fila del SLA de volumen no ruteado (`plan_ruteo_pushed`), medido por los
 * bultos no ruteados que el ruteador carga al cerrar (ruteo_cierres). Un día
 * cumple si no_ruteados ÷ (no_ruteados + ruteados) ≤ PUSHED_MAX_PCT.
 */
async function filaPushed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  diasDelMes: number,
): Promise<CumplimientoSlaFila> {
  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  const hastaExcl =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const { data } = await supabase
    .from("ruteo_cierres")
    .select("fecha, estado, bultos_no_ruteados, pergamino_bultos, ramallo_bultos")
    .gte("fecha", desde)
    .lt("fecha", hastaExcl)

  // día → pct de no ruteado (solo días cerrados)
  const pctPorDia = new Map<number, number>()
  for (const row of (data ?? []) as any[]) {
    if (row.estado !== "cerrado") continue
    const dia = Number((row.fecha as string).slice(8, 10))
    const noRut = Number(row.bultos_no_ruteados ?? 0)
    const ruteado =
      Number(row.pergamino_bultos ?? 0) + Number(row.ramallo_bultos ?? 0)
    const total = noRut + ruteado
    pctPorDia.set(dia, total > 0 ? (noRut / total) * 100 : 0)
  }

  const dias: EstadoCumplimiento[] = []
  let totalAplica = 0
  let cumplidos = 0

  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (dowFromISO(iso) === 0) {
      dias.push("na")
      continue
    }
    const pct = pctPorDia.get(d)
    if (pct == null) {
      dias.push("sd")
      continue
    }
    const cumple = pct <= PUSHED_MAX_PCT
    totalAplica++
    if (cumple) cumplidos++
    dias.push(cumple ? "si" : "no")
  }

  const porcentaje =
    totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null

  return {
    codigo: "plan_ruteo_pushed",
    nombre: SLA_PUSHED_NOMBRE,
    target: SLA_PUSHED_TARGET,
    porcentaje,
    cumplidos,
    totalAplica,
    dias,
  }
}

/**
 * Cumplimiento de los SLA medibles para un mes (year, month=1..12), como
 * matriz: una fila por SLA, una columna por día. Tiempo de ruteo, entrega de
 * preventa (Ventas↔Operaciones), capacidad del camión y volumen no ruteado.
 * Días en curso/sin registro = "sin dato" (no penalizan el %).
 */
export async function getCumplimientoMes(
  year: number,
  month: number,
): Promise<Result<CumplimientoMes>> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return {
        error: "El cumplimiento de SLA solo está disponible en Pampeana.",
      }
    }
    const supabase = await createClient()

    // Cantidad de días del mes (day 0 del mes siguiente = último del actual).
    const diasDelMes = new Date(Date.UTC(year, month, 0)).getUTCDate()

    const filas: CumplimientoSlaFila[] = [
      await filaSyop(supabase, year, month, diasDelMes),
      await filaRuteo(supabase, year, month, diasDelMes),
      await filaCapacidad(supabase, year, month, diasDelMes),
      await filaPushed(supabase, year, month, diasDelMes),
    ]

    return { data: { year, month, diasDelMes, filas } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error calculando el cumplimiento",
    }
  }
}

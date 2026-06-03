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
  SLA_RECEPCION_NOMBRE,
  SLA_RECEPCION_TARGET,
  CAPACIDAD_MIN_PCT,
  cumpleRecepcion,
  type CumplimientoMes,
  type CumplimientoSlaFila,
  type EstadoCumplimiento,
  type DetalleDiaSla,
} from "@/lib/sla-cumplimiento"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
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
 * Fila del SLA de volumen no ruteado (`plan_ruteo_pushed`). Es un SLA de
 * PROCEDIMIENTO, no de umbral: ante un bulto no ruteado se avisa a Ventas y se
 * reprograma la entrega con prioridad. Por eso el cumplimiento diario es
 * siempre "Sí" (mientras se siga el procedimiento) y la columna MTD muestra el
 * ACUMULADO de bultos no despachados del mes (informativo), no un porcentaje.
 * Fuente: ruteo_cierres.bultos_no_ruteados (carga el ruteador al cerrar).
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
    .select("fecha, estado, bultos_no_ruteados")
    .gte("fecha", desde)
    .lt("fecha", hastaExcl)

  // día → bultos no ruteados (solo días cerrados)
  const noRutPorDia = new Map<number, number>()
  let bultosAcum = 0
  for (const row of (data ?? []) as any[]) {
    if (row.estado !== "cerrado") continue
    const dia = Number((row.fecha as string).slice(8, 10))
    const noRut = Number(row.bultos_no_ruteados ?? 0)
    noRutPorDia.set(dia, noRut)
    bultosAcum += noRut
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
    if (!noRutPorDia.has(d)) {
      dias.push("sd") // sin ruteo cerrado registrado / futuro
      continue
    }
    // SLA de procedimiento: el día cumple siempre (se avisa y reprograma).
    totalAplica++
    cumplidos++
    dias.push("si")
  }

  const porcentaje = totalAplica > 0 ? 100 : null

  return {
    codigo: "plan_ruteo_pushed",
    nombre: SLA_PUSHED_NOMBRE,
    target: SLA_PUSHED_TARGET,
    porcentaje,
    cumplidos,
    totalAplica,
    dias,
    // La columna MTD muestra el acumulado de bultos no despachados, no el %.
    mtdLabel: `${bultosAcum.toLocaleString("es-AR")} bultos`,
  }
}

/**
 * Fila del SLA #7 de recepción de acarreos (`alm_recepcion`). A diferencia de
 * los otros SLA, mide POR RECEPCIÓN (no por día): cumplidos/totalAplica cuentan
 * recepciones evaluables (arribo 08:00–16:00 y con fin de descarga). El array
 * `dias` se deriva por día solo para colorear las celdas (todas cumplen → "si").
 * Lee la tabla `recepcion_acarreos` desde la Supabase de acarreo-rdf (otro
 * proyecto). Si la integración no está configurada o falla, degrada a "sin dato".
 */
async function filaRecepcion(
  year: number,
  month: number,
  diasDelMes: number,
): Promise<CumplimientoSlaFila> {
  const base = {
    codigo: "alm_recepcion",
    nombre: SLA_RECEPCION_NOMBRE,
    target: SLA_RECEPCION_TARGET,
  }
  const diasVacio: EstadoCumplimiento[] = []
  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    diasVacio.push(dowFromISO(iso) === 0 ? "na" : "sd")
  }

  const acarreo = createAcarreoClient()
  if (!acarreo) {
    return { ...base, porcentaje: null, cumplidos: 0, totalAplica: 0, dias: diasVacio }
  }

  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  const hastaExcl =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`

  const { data, error } = await acarreo
    .from("recepcion_acarreos")
    .select("fecha, hora_arribo, hora_fin_descarga")
    .gte("fecha", desde)
    .lt("fecha", hastaExcl)

  if (error || !data) {
    return { ...base, porcentaje: null, cumplidos: 0, totalAplica: 0, dias: diasVacio }
  }

  const porDia = new Map<number, { cumple: number; total: number }>()
  let cumplidos = 0
  let totalAplica = 0
  for (const r of data as any[]) {
    const res = cumpleRecepcion(r.hora_arribo, r.hora_fin_descarga)
    if (res === null) continue // fuera de ventana 08–16 o sin fin de descarga
    const dia = Number((r.fecha as string).slice(8, 10))
    totalAplica++
    if (res) cumplidos++
    const a = porDia.get(dia) ?? { cumple: 0, total: 0 }
    a.total++
    if (res) a.cumple++
    porDia.set(dia, a)
  }

  const dias: EstadoCumplimiento[] = []
  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    if (dowFromISO(iso) === 0) {
      dias.push("na")
      continue
    }
    const a = porDia.get(d)
    if (!a || a.total === 0) {
      dias.push("sd")
      continue
    }
    dias.push(a.cumple === a.total ? "si" : "no")
  }

  const porcentaje = totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null
  return { ...base, porcentaje, cumplidos, totalAplica, dias }
}

/**
 * Cumplimiento de los SLA medibles para un mes (year, month=1..12), como
 * matriz: una fila por SLA, una columna por día. Tiempo de ruteo, entrega de
 * preventa (Ventas↔Operaciones), capacidad del camión, volumen no ruteado y
 * recepción de acarreos. Días en curso/sin registro = "sin dato".
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
      await filaRecepcion(year, month, diasDelMes),
    ]

    return { data: { year, month, diasDelMes, filas } }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error calculando el cumplimiento",
    }
  }
}

// ===========================================================================
// Detalle de un día/SLA — para el modal al hacer clic en una celda de la matriz
// ===========================================================================

const DIA_LABEL_LARGO = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
]

/** Minutos desde medianoche → "HH:MM". */
function fmtMin(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** % con una decimal y coma decimal (es-AR). */
function fmtPct(n: number): string {
  return `${n.toFixed(1).replace(".", ",")}%`
}

/**
 * Detalle del cumplimiento de un SLA en una fecha puntual (YYYY-MM-DD), para el
 * modal de la pestaña Cumplimientos. Pampeana-only.
 */
export async function getDetalleDiaSla(
  codigo: string,
  fecha: string,
): Promise<Result<DetalleDiaSla>> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return { error: "El cumplimiento de SLA solo está disponible en Pampeana." }
    }
    const supabase = await createClient()
    const dow = dowFromISO(fecha)
    const diaSemana = DIA_LABEL_LARGO[dow]

    if (codigo === "plan_ruteo_tiempo" || codigo === "plan_syop") {
      const esTiempo = codigo === "plan_ruteo_tiempo"
      const campo = esTiempo ? "hora_fin" : "hora_fin_preventa"
      const { data } = await supabase
        .from("ruteo_cierres")
        .select(`hora_inicio, hora_fin, hora_fin_preventa, estado`)
        .eq("fecha", fecha)
        .maybeSingle()

      const limMin = esTiempo ? limiteMinutos(dow) : limitePreventa(dow)
      const metaLabel = `Límite ≤ ${limMin === null ? "—" : fmtMin(limMin)}`
      const horaISO = (data as any)?.[campo] as string | null

      let estado: EstadoCumplimiento = "sd"
      let nota: string | undefined
      if (limMin === null) {
        estado = "na"
        nota = "Domingo: no aplica."
      } else if (!horaISO) {
        estado = "sd"
        nota = esTiempo
          ? "No hay ruteo cerrado registrado este día."
          : "No se registró el fin de preventa este día."
      } else {
        estado = minutosARG(horaISO) <= limMin ? "si" : "no"
      }

      const filas: { label: string; valor: string }[] = []
      if (esTiempo && (data as any)?.hora_inicio) {
        filas.push({
          label: "Inicio de ruteo",
          valor: fmtMin(minutosARG((data as any).hora_inicio)),
        })
      }
      if (horaISO) {
        filas.push({
          label: esTiempo ? "Fin de ruteo" : "Fin de preventa",
          valor: fmtMin(minutosARG(horaISO)),
        })
      }

      return {
        data: {
          codigo,
          nombre: esTiempo ? SLA_RUTEO_NOMBRE : SLA_SYOP_NOMBRE,
          fecha,
          diaSemana,
          estado,
          metaLabel,
          valorLabel: horaISO ? fmtMin(minutosARG(horaISO)) : "—",
          filas,
          nota,
        },
      }
    }

    if (codigo === "plan_ruteo_capacidad") {
      const { data } = await supabase
        .from("ocupacion_bodega_diaria")
        .select("patente, ceq_total, ob_pct_target")
        .eq("fecha", fecha)
        .order("ceq_total", { ascending: false })

      const rows = (data ?? []) as any[]
      // CAPACIDAD_MIN_PCT = 100 sobre base 525 ⇒ "promedio de CEq ≥ 525".
      const metaLabel = `Promedio ≥ ${CAPACIDAD_MIN_PCT}% del mínimo de carga`

      let estado: EstadoCumplimiento = "sd"
      let nota: string | undefined
      let valorLabel = "—"
      const filas: { label: string; valor: string }[] = []

      if (dow === 0) {
        estado = "na"
        nota = "Domingo: no se reparte."
      } else if (rows.length === 0) {
        estado = "sd"
        nota = "Sin ocupación de bodega registrada este día (depende del sync de Chess)."
      } else {
        const prom =
          rows.reduce((a, r) => a + Number(r.ob_pct_target ?? 0), 0) / rows.length
        const promCeq =
          rows.reduce((a, r) => a + Number(r.ceq_total ?? 0), 0) / rows.length
        estado = prom >= CAPACIDAD_MIN_PCT ? "si" : "no"
        valorLabel = `${promCeq.toFixed(0)} CEq · ${fmtPct(prom)}`
        for (const r of rows) {
          filas.push({
            label: String(r.patente ?? "—"),
            valor: `${Number(r.ceq_total ?? 0).toFixed(0)} CEq · ${fmtPct(Number(r.ob_pct_target ?? 0))}`,
          })
        }
      }

      return {
        data: {
          codigo,
          nombre: SLA_CAPACIDAD_NOMBRE,
          fecha,
          diaSemana,
          estado,
          metaLabel,
          valorLabel,
          filas,
          nota,
        },
      }
    }

    if (codigo === "plan_ruteo_pushed") {
      const { data } = await supabase
        .from("ruteo_cierres")
        .select("estado, bultos_no_ruteados")
        .eq("fecha", fecha)
        .maybeSingle()

      const metaLabel = "Avisar a Ventas y reprogramar con prioridad"
      let estado: EstadoCumplimiento = "sd"
      let nota: string | undefined
      let valorLabel = "—"
      const filas: { label: string; valor: string }[] = []

      if (dow === 0) {
        estado = "na"
        nota = "Domingo: no aplica."
      } else if (!data || (data as any).estado !== "cerrado") {
        estado = "sd"
        nota = "No hay ruteo cerrado registrado este día."
      } else {
        const noRut = Number((data as any).bultos_no_ruteados ?? 0)
        // SLA de procedimiento: cumple siempre que se siga el procedimiento.
        estado = "si"
        valorLabel = `${noRut.toLocaleString("es-AR")} bultos sin rutear`
        filas.push({ label: "Bultos no ruteados", valor: String(noRut) })
        nota =
          noRut > 0
            ? "Procedimiento: se avisa a Ventas por WhatsApp y se reprograma la entrega con prioridad."
            : "Sin bultos no ruteados este día."
      }

      return {
        data: {
          codigo,
          nombre: SLA_PUSHED_NOMBRE,
          fecha,
          diaSemana,
          estado,
          metaLabel,
          valorLabel,
          filas,
          nota,
        },
      }
    }

    if (codigo === "alm_recepcion") {
      const metaLabel = "Arribo 08:00–16:00 y descarga ≤ 2 h"
      let estado: EstadoCumplimiento = "sd"
      let nota: string | undefined
      let valorLabel = "—"
      const filas: { label: string; valor: string }[] = []

      const acarreo = createAcarreoClient()
      if (dow === 0) {
        estado = "na"
        nota = "Domingo: no se recibe."
      } else if (!acarreo) {
        estado = "sd"
        nota = "Integración con acarreo-rdf no configurada."
      } else {
        const { data } = await acarreo
          .from("recepcion_acarreos")
          .select("patente, transportista, origen, hora_arribo, hora_fin_descarga")
          .eq("fecha", fecha)
          .order("hora_arribo", { ascending: true })
        const rows = (data ?? []) as any[]
        const evaluables = rows
          .map((r) => cumpleRecepcion(r.hora_arribo, r.hora_fin_descarga))
          .filter((v) => v !== null) as boolean[]

        if (evaluables.length === 0) {
          estado = "sd"
          nota =
            rows.length === 0
              ? "Sin recepciones registradas este día."
              : "Sin recepciones evaluables (arribos fuera de 08:00–16:00 o descarga sin finalizar)."
        } else {
          const cumplidas = evaluables.filter(Boolean).length
          estado = cumplidas === evaluables.length ? "si" : "no"
          valorLabel = `${cumplidas}/${evaluables.length} cumplen`
        }

        for (const r of rows) {
          const ok = cumpleRecepcion(r.hora_arribo, r.hora_fin_descarga)
          const arr = fmtMin(minutosARG(r.hora_arribo))
          const fin = r.hora_fin_descarga ? fmtMin(minutosARG(r.hora_fin_descarga)) : "—"
          const mark = ok === null ? "·" : ok ? "✓" : "✗"
          filas.push({
            label: `${r.patente ?? "—"}${r.origen ? ` · ${r.origen}` : ""}`,
            valor: `${arr}→${fin} ${mark}`,
          })
        }
      }

      return {
        data: {
          codigo,
          nombre: SLA_RECEPCION_NOMBRE,
          fecha,
          diaSemana,
          estado,
          metaLabel,
          valorLabel,
          filas,
          nota,
        },
      }
    }

    return { error: "SLA no reconocido." }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el detalle",
    }
  }
}

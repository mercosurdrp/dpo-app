"use server"

import { revalidatePath } from "next/cache"
import { createClient as createServiceClient } from "@supabase/supabase-js"
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
  SLA_CARGA_NOMBRE,
  SLA_CARGA_TARGET,
  CARGA_LIMITE_HORA,
  CAPACIDAD_MIN_PCT,
  cumpleRecepcion,
  type CumplimientoMes,
  type CumplimientoSlaFila,
  type EstadoCumplimiento,
  type DetalleDiaSla,
  type CumplimientoRango,
  type CumplimientoRangoFila,
} from "@/lib/sla-cumplimiento"
import { createAcarreoClient } from "@/lib/supabase/acarreo"
import type { SlaAdjunto, SlaConAutor, SlaEstado } from "@/types/database"

const DASHBOARD_PATH = "/sla"
const BUCKET = "sla"
const ROLES_GESTION = ["admin", "supervisor"] as const
const MAX_FILE_BYTES = 15 * 1024 * 1024

type Result<T> = { data: T } | { error: string }

/** Cliente con service role para operar Storage sin depender de RLS de storage.objects. */
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120)
}

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
 * Sube el acuerdo firmado (PDF/imagen) y lo registra en un solo paso.
 * El upload y los writes van con service role para NO depender de las
 * policies de storage.objects ni de las RLS de escritura (que en este tenant
 * se corrieron a mano); el control de acceso lo hace el chequeo de rol acá.
 * Solo admin/supervisor.
 */
export async function uploadSlaAdjunto(
  slaId: string,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden cargar acuerdos." }
    }
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) {
      return { error: "No se recibió ningún archivo." }
    }
    if (file.size > MAX_FILE_BYTES) {
      return { error: "El archivo supera el máximo de 15 MB." }
    }

    const service = getServiceClient()
    const safeName = sanitizeFileName(file.name || "acuerdo")
    const path = `${slaId}/${crypto.randomUUID()}-${safeName}`
    const mime = file.type || "application/octet-stream"
    const arrayBuffer = await file.arrayBuffer()

    const { error: upErr } = await service.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, { contentType: mime, upsert: false })
    if (upErr) return { error: upErr.message }

    const { data: inserted, error } = await service
      .from("sla_adjuntos")
      .insert({
        sla_id: slaId,
        storage_path: path,
        nombre_original: file.name,
        mime_type: mime,
        "tamaño_bytes": file.size,
        subido_por: profile.id,
      })
      .select("id")
      .single()

    if (error || !inserted) {
      await service.storage.from(BUCKET).remove([path])
      return { error: error?.message ?? "No se pudo registrar el acuerdo" }
    }

    // Auto-estado: si estaba pendiente, marcar firmado + fecha de firma.
    const { data: sla } = await service
      .from("slas")
      .select("estado, fecha_firma")
      .eq("id", slaId)
      .single()
    if (sla && (sla as any).estado === "pendiente") {
      await service
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
    const service = getServiceClient()

    const { data: adj } = await service
      .from("sla_adjuntos")
      .select("storage_path")
      .eq("id", id)
      .single()

    const { error } = await service.from("sla_adjuntos").delete().eq("id", id)
    if (error) return { error: error.message }

    if (adj?.storage_path) {
      await service.storage.from(BUCKET).remove([adj.storage_path as string])
    }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando el acuerdo",
    }
  }
}

export async function deleteSla(
  id: string,
): Promise<{ success: true } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!ROLES_GESTION.includes(profile.role as any)) {
      return { error: "Solo admin o supervisor pueden borrar SLA." }
    }
    const service = getServiceClient()

    // Borrar primero los archivos del storage de los acuerdos adjuntos.
    const { data: adjuntos } = await service
      .from("sla_adjuntos")
      .select("storage_path")
      .eq("sla_id", id)
    const paths = (adjuntos ?? [])
      .map((a) => a.storage_path as string)
      .filter(Boolean)
    if (paths.length > 0) {
      await service.storage.from(BUCKET).remove(paths)
    }

    // Borrar el SLA (sla_adjuntos cae por FK ON DELETE CASCADE).
    const { error } = await service.from("slas").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath(DASHBOARD_PATH)
    return { success: true }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error borrando el SLA",
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

// ===========================================================================
// SLA de carga (alm_carga) — cada viaje ruteado queda cargado antes de las
// 07:00 ARG del día de REPARTO (día de salida del camión). Se cruza por
// NÚMERO DE VIAJE (no por patente): el WMS expone, por viaje, la hora de carga
// real (ViajesFhDespacho/HrDespacho); el día de reparto se deriva de esa hora
// (regla de corte de las 11:00), no del `reparto` del WMS, que rotula mal la tarde. La
// patente (BANDVIA) llega con ~5 días de lag y por eso ya NO se usa para medir.
// Un viaje ruteado y nunca cargado pasado el plazo = incumplimiento.
// Fuente: blob 'carga-camiones' del WMS (mismo que muestra /carga-camiones).
// ===========================================================================

const CARGA_BLOB_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=carga-camiones"

interface CargaViaje {
  viaje: number // ViajesCodigo (clave de cruce)
  reparto: string // YYYY-MM-DD (ARG) — día de salida; plazo = 07:00 de este día
  fecha: string | null // YYYY-MM-DD (ARG) carga real, null si ruteado sin cargar
  hora: string | null // HH:mm:ss (ARG, fin de carga), null si ruteado sin cargar
  patente: string // informativo; puede venir vacío (ya NO se cruza por acá)
}

interface CargaSnapshot {
  viajes: CargaViaje[]
  generadoEn: string | null // timestamp del snapshot del WMS (ISO)
}

/** 'YYYY-MM-DD' + 1 día (sin corrimiento por TZ). */
function nextISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

// Hora de corte que separa "carga para salir mañana" de "carga de la madrugada
// del propio día". Una carga a esta hora o más tarde se considera de la tarde
// anterior → su reparto es el día siguiente.
const CARGA_CORTE_TARDE = "11:00:00"

/**
 * Día de reparto derivado de la hora real de carga. Regla de corte: una carga
 * ≥11:00 es "la tarde anterior" → reparto = fecha+1; una carga <11:00 es la
 * madrugada del propio día de reparto → reparto = fecha. Se aplica siempre que
 * haya carga: el `reparto` que manda el WMS no es confiable (rotula la carga de
 * la tarde con el mismo día, no con el día de salida del camión).
 */
function repartoDesdeCarga(fecha: string, hora: string): string {
  return hora >= CARGA_CORTE_TARDE ? nextISO(fecha) : fecha
}

/** Plazo (ms UTC) de un reparto = 07:00 ARG = 10:00 UTC de ese día. */
function plazoRepartoMs(repartoISO: string): number {
  const [y, m, d] = repartoISO.split("-").map(Number)
  return Date.UTC(y, m - 1, d, 10, 0, 0)
}

/**
 * Lee el blob del WMS y devuelve un viaje por nº (deduplicado). `null` si la
 * fuente no está disponible. Acepta tanto el blob nuevo (con `reparto` y viajes
 * ruteados sin cargar) como el viejo (solo cargados; reparto se deriva).
 */
async function fetchCargaSnapshot(): Promise<CargaSnapshot | null> {
  try {
    const res = await fetch(CARGA_BLOB_URL, { cache: "no-store" })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: { filas?: any[]; generado_en?: string | null } | null
    }
    const filas = Array.isArray(json?.data?.filas) ? json.data!.filas! : []
    // Un viaje puede aparecer en varias filas (ruteo + eventos de despacho).
    // Nos quedamos con la versión cargada y, si hay varias, con la carga más
    // tardía (= fin de carga). Una fila cargada siempre gana a una sin cargar.
    const byViaje = new Map<number, CargaViaje>()
    for (const f of filas) {
      const viaje = Number(f?.viaje)
      if (!Number.isFinite(viaje) || viaje <= 0) continue
      const fecha = f?.fecha ? String(f.fecha) : null
      const hora = f?.hora ? String(f.hora) : null
      const cargado = !!(fecha && hora)
      // El WMS rotula `reparto` con el MISMO día de la carga, aunque el camión se
      // cargue a la tarde para salir al día siguiente: eso hacía que toda carga
      // de la tarde figurara "tarde" contra las 07:00 del propio día. Cuando hay
      // carga real, derivamos el reparto de la hora (regla de corte de las 11:00) e
      // ignoramos el del WMS. Solo los viajes ruteados sin cargar caen al del WMS.
      const reparto = cargado
        ? repartoDesdeCarga(fecha!, hora!)
        : f?.reparto
          ? String(f.reparto)
          : null
      if (!reparto) continue // sin reparto ni carga: no se puede ubicar
      const cand: CargaViaje = {
        viaje,
        reparto,
        fecha: cargado ? fecha : null,
        hora: cargado ? hora : null,
        patente: f?.patente ? String(f.patente).trim().toUpperCase() : "",
      }
      const prev = byViaje.get(viaje)
      if (!prev) {
        byViaje.set(viaje, cand)
        continue
      }
      const prevKey = prev.fecha && prev.hora ? `${prev.fecha}T${prev.hora}` : ""
      const candKey = cand.fecha && cand.hora ? `${cand.fecha}T${cand.hora}` : ""
      if (candKey > prevKey) byViaje.set(viaje, cand)
    }
    return {
      viajes: [...byViaje.values()],
      generadoEn: json?.data?.generado_en ?? null,
    }
  } catch {
    return null
  }
}


// ===========================================================================
// SLA de carga PRE-COCINADO — blob 'sla-carga' publicado por el pusher local
// del depósito (PowerShell, compu del WMS). El pusher ya cruza: esperados de
// ChessERP (sin MOSTRADOR RAMALLO) + cargas reales del WMS (hora del escaneo
// Ev17) + histórico, y evalúa cada día de reparto. dpo-app solo lee y muestra.
// Si el blob no existe o no cubre el mes pedido, se cae al modelo MIXTO de
// arriba (esperados por ruteo + horas del blob carga-camiones).
// Contrato del blob (POST /api/shared/save, module="sla-carga"):
//   { generado_en: ISO, dias: { "YYYY-MM-DD" (día de REPARTO): {
//       estado: "si"|"no"|"sd"|"na", esperados, a_tiempo, tarde, faltan,
//       viajes: [{ viaje, patente, hora "HH:mm:ss", a_tiempo: bool }],
//       faltantes: ["PATENTE", ...], nota?: string } } }
// Días aún no vencidos deben venir "sd" o directamente ausentes.
// ===========================================================================

const SLA_CARGA_PRECOCIDO_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=sla-carga"

interface SlaCargaViajePre {
  viaje: number | null
  patente: string
  hora: string | null // HH:mm:ss fin de carga real (escaneo Ev17)
  aTiempo: boolean
}

interface SlaCargaDiaPre {
  estado: EstadoCumplimiento
  esperados: number
  aTiempo: number
  tarde: number
  faltan: number
  viajes: SlaCargaViajePre[]
  faltantes: string[] // patentes ruteadas sin carga conciliada
  nota: string | null
}

interface SlaCargaPrecocido {
  dias: Map<string, SlaCargaDiaPre> // clave: YYYY-MM-DD (día de reparto)
  generadoEn: string | null
}

const ESTADOS_PRECOCIDOS = new Set<string>(["si", "no", "sd", "na"])

/** Lee el blob pre-cocinado del pusher. `null` si no existe o viene vacío. */
async function fetchSlaCargaPrecocido(): Promise<SlaCargaPrecocido | null> {
  try {
    const res = await fetch(SLA_CARGA_PRECOCIDO_URL, { cache: "no-store" })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: { dias?: Record<string, any>; generado_en?: string | null } | null
    }
    const diasRaw = json?.data?.dias
    if (!diasRaw || typeof diasRaw !== "object") return null
    const dias = new Map<string, SlaCargaDiaPre>()
    for (const [fecha, d] of Object.entries(diasRaw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !d || typeof d !== "object") continue
      const estado = ESTADOS_PRECOCIDOS.has(String(d.estado))
        ? (String(d.estado) as EstadoCumplimiento)
        : "sd"
      const viajes: SlaCargaViajePre[] = Array.isArray(d.viajes)
        ? d.viajes.map((v: any) => ({
            viaje: Number.isFinite(Number(v?.viaje)) && Number(v?.viaje) > 0 ? Number(v.viaje) : null,
            patente: v?.patente ? String(v.patente).trim().toUpperCase() : "",
            hora: v?.hora ? String(v.hora) : null,
            aTiempo: !!v?.a_tiempo,
          }))
        : []
      const faltantes: string[] = Array.isArray(d.faltantes)
        ? d.faltantes.map((p: any) => String(p).trim().toUpperCase()).filter(Boolean)
        : []
      dias.set(fecha, {
        estado,
        esperados: Number(d.esperados) || 0,
        aTiempo: Number(d.a_tiempo) || 0,
        tarde: Number(d.tarde) || 0,
        faltan: Number(d.faltan) || 0,
        viajes,
        faltantes,
        nota: d.nota ? String(d.nota) : null,
      })
    }
    if (dias.size === 0) return null
    return { dias, generadoEn: json?.data?.generado_en ?? null }
  } catch {
    return null
  }
}

/** ¿El blob pre-cocinado trae al menos un día del mes pedido? */
function precocidoCubreMes(
  pre: SlaCargaPrecocido | null,
  year: number,
  month: number,
): boolean {
  if (!pre) return false
  const pref = `${year}-${String(month).padStart(2, "0")}`
  for (const fecha of pre.dias.keys()) if (fecha.startsWith(pref)) return true
  return false
}

/**
 * Fila del SLA de carga desde el blob pre-cocinado: el estado de cada día ya
 * viene evaluado por el pusher; acá solo se arma la matriz y el %. Días que el
 * blob no trae = sin dato (domingo = na).
 */
function filaCargaPrecocida(
  pre: SlaCargaPrecocido,
  year: number,
  month: number,
  diasDelMes: number,
): CumplimientoSlaFila {
  const mm = String(month).padStart(2, "0")
  const dias: EstadoCumplimiento[] = []
  let totalAplica = 0
  let cumplidos = 0
  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${mm}-${String(d).padStart(2, "0")}`
    const dia = pre.dias.get(iso)
    const estado: EstadoCumplimiento =
      dia?.estado ?? (dowFromISO(iso) === 0 ? "na" : "sd")
    if (estado === "si" || estado === "no") {
      totalAplica++
      if (estado === "si") cumplidos++
    }
    dias.push(estado)
  }
  return {
    codigo: "alm_carga",
    nombre: SLA_CARGA_NOMBRE,
    target: SLA_CARGA_TARGET,
    porcentaje: totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null,
    cumplidos,
    totalAplica,
    dias,
  }
}

/** Primer día del mes siguiente en ISO (para rangos [desde, hastaExcl)). */
function primerDiaMesSiguiente(year: number, month: number): string {
  const y = month === 12 ? year + 1 : year
  const m = month === 12 ? 1 : month + 1
  return `${y}-${String(m).padStart(2, "0")}-01`
}

/**
 * Una carga está "a tiempo" si ocurrió antes de las 07:00 o a partir de las
 * 11:00. La franja 07:00–11:00 es tarde: el camión se cargó de mañana para salir
 * ese mismo día y pasó el plazo de las 07:00. A partir de las 11:00 se considera
 * carga de la tarde anterior (sale al día siguiente) → a tiempo.
 */
function cargaATiempo(hora: string): boolean {
  return hora < CARGA_LIMITE_HORA || hora >= CARGA_CORTE_TARDE
}

/** Esperados por día del mes: nº de patentes ruteadas (ocupación de bodega). */
async function esperadosPorDiaMes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
): Promise<Map<number, number>> {
  const mm = String(month).padStart(2, "0")
  const { data } = await supabase
    .from("ocupacion_bodega_diaria")
    .select("fecha")
    .gte("fecha", `${year}-${mm}-01`)
    .lt("fecha", primerDiaMesSiguiente(year, month))
    .gt("ceq_total", 0)
  const out = new Map<number, number>()
  for (const r of (data ?? []) as Array<{ fecha: string }>) {
    const dia = Number(String(r.fecha).slice(8, 10))
    out.set(dia, (out.get(dia) ?? 0) + 1)
  }
  return out
}

/** Horas de carga del blob por día (fecha real de carga), sin placeholders. */
function cargasPorDiaMes(
  carga: CargaSnapshot | null,
  year: number,
  month: number,
): Map<number, string[]> {
  const mm = String(month).padStart(2, "0")
  const out = new Map<number, string[]>()
  for (const v of carga?.viajes ?? []) {
    if (!v.fecha || !v.hora || v.patente === "0") continue
    if (v.fecha.slice(0, 7) !== `${year}-${mm}`) continue
    const dia = Number(v.fecha.slice(8, 10))
    const arr = out.get(dia) ?? []
    arr.push(v.hora)
    out.set(dia, arr)
  }
  return out
}

/**
 * Estado de un día (modelo mixto): se esperan `esperados` camiones (ruteo) y se
 * registraron las `horas` de carga del blob. No cumple si alguna carga fue tarde
 * o si faltan camiones por cargar con el plazo ya vencido; sin dato si el faltante
 * podría deberse a un snapshot del WMS previo al plazo.
 */
function evaluarDiaCarga(
  esperados: number,
  horas: string[],
  snapMs: number | null,
  plazoMs: number,
): EstadoCumplimiento {
  const tarde = horas.filter((h) => !cargaATiempo(h)).length
  if (tarde > 0) return "no"
  const faltan = Math.max(0, esperados - horas.length)
  if (faltan > 0) {
    // Las horas del blob no tienen lag (sí la patente). Un faltante con snapshot
    // posterior al plazo = camión ruteado sin carga conciliada → no cumple.
    if (snapMs !== null && snapMs < plazoMs) return "sd"
    return "no"
  }
  return "si"
}

/**
 * Fila del SLA de carga (`alm_carga`), modelo MIXTO:
 *   • "Esperados" = camiones ruteados ese día (ocupación de bodega, por patente),
 *     el mismo universo que muestra /ruteo.
 *   • Las horas de carga vienen del blob del WMS, al día (por nº de viaje, sin
 *     depender de la patente que el WMS asigna con ~5 días de lag).
 * Un día cumple si todos los esperados quedaron cargados y a tiempo. El plazo del
 * día es las 07:00 del día siguiente (la salida típica). Día en curso o sin
 * fuente → sin dato.
 */
async function filaCarga(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  diasDelMes: number,
  carga: CargaSnapshot | null,
): Promise<CumplimientoSlaFila> {
  const base = {
    codigo: "alm_carga",
    nombre: SLA_CARGA_NOMBRE,
    target: SLA_CARGA_TARGET,
  }
  const mm = String(month).padStart(2, "0")
  const esperados = await esperadosPorDiaMes(supabase, year, month)
  const cargas = cargasPorDiaMes(carga, year, month)

  const nowMs = Date.now()
  const snapMs = carga?.generadoEn ? Date.parse(carga.generadoEn) : null
  const dias: EstadoCumplimiento[] = []
  let totalAplica = 0
  let cumplidos = 0

  for (let d = 1; d <= diasDelMes; d++) {
    const iso = `${year}-${mm}-${String(d).padStart(2, "0")}`
    if (dowFromISO(iso) === 0) {
      dias.push("na") // domingo: no hay reparto
      continue
    }
    const esp = esperados.get(d) ?? 0
    const horas = cargas.get(d) ?? []
    if (carga === null || (esp === 0 && horas.length === 0)) {
      dias.push("sd") // sin fuente / sin ruteo / futuro
      continue
    }
    const plazoMs = plazoRepartoMs(nextISO(iso)) // 07:00 del día siguiente
    if (nowMs < plazoMs) {
      dias.push("sd") // día en curso, los camiones aún pueden cargar
      continue
    }
    const estado = evaluarDiaCarga(esp, horas, snapMs, plazoMs)
    if (estado !== "sd") {
      totalAplica++
      if (estado === "si") cumplidos++
    }
    dias.push(estado)
  }

  const porcentaje =
    totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null

  return { ...base, porcentaje, cumplidos, totalAplica, dias }
}

/**
 * Cumplimiento de los SLA medibles para un mes (year, month=1..12), como
 * matriz: una fila por SLA, una columna por día. Tiempo de ruteo, entrega de
 * preventa (Ventas↔Operaciones), capacidad del camión, volumen no ruteado,
 * carga de camiones y recepción de acarreos. Días en curso/sin registro = "sin dato".
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

    // Carga de camiones: primero el blob PRE-COCINADO del pusher (sla-carga);
    // si no cubre el mes, modelo mixto con el snapshot crudo del WMS.
    const cargaPre = await fetchSlaCargaPrecocido()
    const filaCargaResuelta = precocidoCubreMes(cargaPre, year, month)
      ? filaCargaPrecocida(cargaPre!, year, month, diasDelMes)
      : await filaCarga(supabase, year, month, diasDelMes, await fetchCargaSnapshot())

    const filas: CumplimientoSlaFila[] = [
      await filaSyop(supabase, year, month, diasDelMes),
      await filaRuteo(supabase, year, month, diasDelMes),
      await filaCapacidad(supabase, year, month, diasDelMes),
      await filaPushed(supabase, year, month, diasDelMes),
      filaCargaResuelta,
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
        .select(
          `hora_inicio, hora_fin, hora_fin_preventa, estado, notas, comentario_preventa`,
        )
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

      // Justificativo cargado en /ruteo: notas para el cierre del ruteo,
      // comentario_preventa para el fin de preventa.
      const comentario = esTiempo
        ? ((data as any)?.notas as string | null)
        : ((data as any)?.comentario_preventa as string | null)

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
          comentario: comentario ?? null,
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
      const metaLabel = "Arribo 08:00–16:00 y descarga ≤ 3 h"
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

    if (codigo === "alm_carga") {
      // Primero el blob pre-cocinado del pusher: trae el día ya evaluado con
      // sus viajes (hora real Ev17) y faltantes. Fallback: modelo mixto.
      const pre = await fetchSlaCargaPrecocido()
      const diaPre = pre?.dias.get(fecha)
      if (diaPre) {
        const filas: { label: string; valor: string }[] = []
        for (const v of diaPre.viajes) {
          const label =
            (v.viaje ? `Viaje ${v.viaje}` : "Viaje s/nº") +
            (v.patente ? ` · ${v.patente}` : "")
          const hhmm = v.hora ? v.hora.slice(0, 5) : "—"
          filas.push({
            label,
            valor: v.aTiempo ? `${hhmm} ✓` : `${hhmm} (tarde) ✗`,
          })
        }
        if (diaPre.faltantes.length > 0) {
          for (const p of diaPre.faltantes) {
            filas.push({ label: p, valor: "sin carga conciliada ✗" })
          }
        } else if (diaPre.faltan > 0) {
          filas.push({
            label: "Sin carga conciliada",
            valor: `${diaPre.faltan} camión(es) ruteado(s) ✗`,
          })
        }
        let valorLabel = "—"
        if (diaPre.estado === "si") valorLabel = `${diaPre.esperados}/${diaPre.esperados} a tiempo`
        else if (diaPre.tarde > 0) valorLabel = `${diaPre.tarde} carga(s) tarde`
        else if (diaPre.estado === "no" && diaPre.faltan > 0)
          valorLabel = `faltan ${diaPre.faltan} de ${diaPre.esperados}`
        let nota = diaPre.nota ?? undefined
        if (!nota && diaPre.estado === "na") nota = "Domingo: no hay reparto."
        if (!nota && diaPre.faltan > 0 && diaPre.tarde === 0)
          nota = `${diaPre.faltan} camión(es) ruteado(s) sin carga conciliada en el WMS.`
        return {
          data: {
            codigo,
            nombre: SLA_CARGA_NOMBRE,
            fecha,
            diaSemana,
            estado: diaPre.estado,
            metaLabel:
              "Camiones ruteados (ChessERP) cargados antes de las 07:00 del día de reparto",
            valorLabel,
            filas,
            nota,
          },
        }
      }

      const metaLabel = "Camiones ruteados cargados a tiempo (antes de 07:00 o desde 11:00)"
      let estado: EstadoCumplimiento = "sd"
      let nota: string | undefined
      let valorLabel = "—"
      const filas: { label: string; valor: string }[] = []

      if (dow === 0) {
        estado = "na"
        nota = "Domingo: no hay reparto."
        return {
          data: { codigo, nombre: SLA_CARGA_NOMBRE, fecha, diaSemana, estado, metaLabel, valorLabel, filas, nota },
        }
      }

      // Esperados = camiones ruteados (ocupación de bodega de este día).
      const { data: obRows } = await supabase
        .from("ocupacion_bodega_diaria")
        .select("patente")
        .eq("fecha", fecha)
        .gt("ceq_total", 0)
      const patentesEsperadas = ((obRows ?? []) as Array<{ patente: string }>)
        .map((r) => String(r.patente))
        .sort()
      const esperados = patentesEsperadas.length

      // Cargas del blob de este día (fecha de carga real), sin placeholders.
      const carga = await fetchCargaSnapshot()
      const cargasD = (carga?.viajes ?? [])
        .filter((v) => v.fecha === fecha && v.hora && v.patente !== "0")
        .sort((a, b) => a.viaje - b.viaje)
      const plazoMs = plazoRepartoMs(nextISO(fecha)) // 07:00 del día siguiente

      if (carga === null) {
        estado = "sd"
        nota = "No se pudo leer la carga de camiones del WMS."
      } else if (esperados === 0 && cargasD.length === 0) {
        estado = "sd"
        nota = "Sin camiones ruteados para este día."
      } else if (Date.now() < plazoMs) {
        estado = "sd"
        nota = "El plazo (07:00 del día siguiente) todavía no venció; los camiones aún pueden cargar."
      } else {
        const snapMs = carga.generadoEn ? Date.parse(carga.generadoEn) : null
        const horas = cargasD.map((v) => v.hora as string)
        estado = evaluarDiaCarga(esperados, horas, snapMs, plazoMs)

        let aTiempo = 0
        let tarde = 0
        for (const v of cargasD) {
          const hhmm = (v.hora as string).slice(0, 5)
          const label = `Viaje ${v.viaje}` + (v.patente ? ` · ${v.patente}` : "")
          if (cargaATiempo(v.hora as string)) {
            aTiempo++
            filas.push({ label, valor: `${hhmm} ✓` })
          } else {
            tarde++
            filas.push({ label, valor: `${hhmm} (tarde) ✗` })
          }
        }
        const faltan = Math.max(0, esperados - cargasD.length)
        if (faltan > 0) {
          filas.push({
            label: "Sin carga conciliada",
            valor: `${faltan} camión(es) ruteado(s) ✗`,
          })
        }

        if (estado === "si") valorLabel = `${esperados}/${esperados} a tiempo`
        else if (tarde > 0) valorLabel = `${tarde} carga(s) tarde`
        else if (estado === "no") valorLabel = `faltan ${faltan} de ${esperados}`
        else valorLabel = `${cargasD.length}/${esperados} (incompleto)`

        if (estado === "sd") {
          nota =
            "El snapshot del WMS es previo al plazo; pueden faltar cargas por registrar. Se reevaluará al actualizarse."
        } else if (faltan > 0 && tarde === 0) {
          nota = `${faltan} camión(es) ruteado(s) sin carga conciliada en el WMS.`
        }
      }

      return {
        data: { codigo, nombre: SLA_CARGA_NOMBRE, fecha, diaSemana, estado, metaLabel, valorLabel, filas, nota },
      }
    }

    return { error: "SLA no reconocido." }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error cargando el detalle",
    }
  }
}

// ---------------------------------------------------------------------------
// getCumplimientoRango — cumplimiento día a día de todos los SLAs medibles
// en un rango [desde, hasta]. Reúne el/los meses (vía getCumplimientoMes) y
// recorta los días al rango. Usado por la Reunión Ventas-Logística.
// ---------------------------------------------------------------------------
export async function getCumplimientoRango(
  desde: string,
  hasta: string,
): Promise<Result<CumplimientoRango>> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return { error: "El cumplimiento de SLA solo está disponible en Pampeana." }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      return { error: "Fechas inválidas (esperado YYYY-MM-DD)" }
    }
    const d0 = desde <= hasta ? desde : hasta
    const d1 = desde <= hasta ? hasta : desde

    // Acumulador por SLA (preserva orden de aparición).
    const acc = new Map<
      string,
      { codigo: string; nombre: string; target: number; dias: { fecha: string; estado: EstadoCumplimiento }[] }
    >()

    // Recorrer meses desde d0 hasta d1.
    let y = Number(d0.slice(0, 4))
    let m = Number(d0.slice(5, 7))
    const yEnd = Number(d1.slice(0, 4))
    const mEnd = Number(d1.slice(5, 7))
    let guard = 0
    while ((y < yEnd || (y === yEnd && m <= mEnd)) && guard++ < 36) {
      const res = await getCumplimientoMes(y, m)
      if ("data" in res) {
        const cm = res.data
        for (const fila of cm.filas) {
          const f =
            acc.get(fila.codigo) ??
            { codigo: fila.codigo, nombre: fila.nombre, target: fila.target, dias: [] }
          for (let d = 0; d < cm.diasDelMes; d++) {
            const fecha = `${y}-${String(m).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`
            if (fecha >= d0 && fecha <= d1) {
              f.dias.push({ fecha, estado: fila.dias[d] ?? "sd" })
            }
          }
          acc.set(fila.codigo, f)
        }
      }
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }

    const filas: CumplimientoRangoFila[] = [...acc.values()].map((f) => {
      const cumplidos = f.dias.filter((x) => x.estado === "si").length
      const totalAplica = f.dias.filter((x) => x.estado === "si" || x.estado === "no").length
      return {
        codigo: f.codigo,
        nombre: f.nombre,
        target: f.target,
        cumplidos,
        totalAplica,
        porcentaje: totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null,
        dias: f.dias,
      }
    })

    return { data: { desde: d0, hasta: d1, filas } }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error calculando el cumplimiento por rango",
    }
  }
}

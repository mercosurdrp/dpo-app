"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
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

export const SLA_RUTEO_NOMBRE = "Tiempo de finalización del ruteo"
export const SLA_RUTEO_TARGET = 95

export interface CumplimientoDiaRuteo {
  fecha: string // YYYY-MM-DD
  diaSemana: string // "Lun".."Sáb"
  aplica: boolean // false los domingos
  limite: string | null // "09:00" / "07:30"
  horaFin: string | null // "08:47" en hora ARG, null si no cerró
  cumple: boolean | null // null si no aplica o sin hora_fin
}

export interface CumplimientoRuteoMes {
  year: number
  month: number
  target: number
  totalAplica: number // días con ruteo medibles (denominador)
  cumplidos: number
  porcentaje: number | null
  dias: CumplimientoDiaRuteo[]
}

const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

/** Día de semana (0=Dom..6=Sáb) de un 'YYYY-MM-DD' sin corrimiento por TZ. */
function dowFromISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Minutos desde medianoche ARG del límite del día, o null si no aplica. */
function limiteMinutos(dow: number): number | null {
  if (dow === 0) return null // domingo: no se rutea
  if (dow === 6) return 7 * 60 + 30 // sábado 07:30
  return 9 * 60 // L-V 09:00
}

/** Minutos desde medianoche en hora ARG (UTC-3) de un timestamp UTC. */
function minutosARG(iso: string): number {
  const d = new Date(iso)
  let mins = d.getUTCHours() * 60 + d.getUTCMinutes() - 180
  if (mins < 0) mins += 1440
  return mins
}

function fmtHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Cumplimiento del SLA de tiempo de ruteo para un mes (year, month=1..12).
 * Solo cuentan en el % los días con ruteo cerrado que aplican (L-Sáb);
 * los días en curso o sin cierre quedan como "sin dato" y no penalizan.
 */
export async function getCumplimientoRuteo(
  year: number,
  month: number,
): Promise<Result<CumplimientoRuteoMes>> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return {
        error: "El cumplimiento de ruteo solo está disponible en Pampeana.",
      }
    }
    const supabase = await createClient()

    const desde = `${year}-${String(month).padStart(2, "0")}-01`
    const hastaExcl =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`

    const { data, error } = await supabase
      .from("ruteo_cierres")
      .select("fecha, estado, hora_fin")
      .gte("fecha", desde)
      .lt("fecha", hastaExcl)
      .order("fecha", { ascending: true })
    if (error) return { error: error.message }

    const dias: CumplimientoDiaRuteo[] = []
    let totalAplica = 0
    let cumplidos = 0

    for (const row of (data ?? []) as any[]) {
      const fecha = row.fecha as string
      const dow = dowFromISO(fecha)
      const limMin = limiteMinutos(dow)
      const aplica = limMin !== null
      const horaFinISO = row.hora_fin as string | null
      const finMin = horaFinISO ? minutosARG(horaFinISO) : null

      let cumple: boolean | null = null
      if (aplica && finMin !== null) {
        cumple = finMin <= (limMin as number)
        totalAplica++
        if (cumple) cumplidos++
      }

      dias.push({
        fecha,
        diaSemana: DIA_LABEL[dow],
        aplica,
        limite: limMin !== null ? fmtHHMM(limMin) : null,
        horaFin: finMin !== null ? fmtHHMM(finMin) : null,
        cumple,
      })
    }

    const porcentaje =
      totalAplica > 0 ? Math.round((cumplidos / totalAplica) * 100) : null

    return {
      data: {
        year,
        month,
        target: SLA_RUTEO_TARGET,
        totalAplica,
        cumplidos,
        porcentaje,
        dias,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error calculando el cumplimiento",
    }
  }
}

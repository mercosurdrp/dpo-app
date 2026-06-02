"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"

type Result<T> = { data: T } | { error: string }

const SOLO_PAMPEANA = "El ruteo solo está disponible en Pampeana."

const SELECT_COLS =
  "id, fecha, estado, hora_inicio, hora_fin, hora_fin_preventa, pergamino_bultos, pergamino_clientes, ramallo_bultos, ramallo_clientes, bultos_no_ruteados, notas, created_at"

export interface RuteoCierre {
  id: string
  fecha: string
  estado: "pendiente" | "en_curso" | "cerrado"
  hora_inicio: string | null
  hora_fin: string | null
  hora_fin_preventa: string | null
  pergamino_bultos: number
  pergamino_clientes: number
  ramallo_bultos: number
  ramallo_clientes: number
  bultos_no_ruteados: number
  notas: string | null
  created_at: string
}

export interface FinRuteoInput {
  id: string
  pergamino_bultos: number
  pergamino_clientes: number
  ramallo_bultos: number
  ramallo_clientes: number
  bultos_no_ruteados: number
  notas?: string | null
}

// Fecha de "hoy" en hora Argentina (UTC-3, sin DST). Evita el corrimiento de
// día que produce slice(ISO) cuando ya pasaron las 21:00 ARG.
function hoyARG(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function toIntNoNeg(v: unknown): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Estado del ruteo del día actual. `null` si todavía no se inició hoy. */
export async function getRuteoDelDia(): Promise<Result<RuteoCierre | null>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .select(SELECT_COLS)
      .eq("fecha", hoyARG())
      .maybeSingle()

    if (error) return { error: error.message }
    return { data: (data as RuteoCierre | null) ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/**
 * Construye un timestamptz ISO a partir de una hora "HH:MM" del día de hoy en
 * zona Argentina (UTC-3). Si no se pasa hora, usa el instante actual.
 */
function timestampARG(horaManual?: string): string {
  if (horaManual && /^\d{1,2}:\d{2}$/.test(horaManual)) {
    const [h, m] = horaManual.split(":")
    return `${hoyARG()}T${h.padStart(2, "0")}:${m}:00-03:00`
  }
  return new Date().toISOString()
}

/**
 * INICIO DE RUTEO: marca hora_inicio = now() y estado = 'en_curso'.
 * Si ya existe la fila del día en estado 'pendiente' (creada al registrar el
 * fin de preventa), la actualiza; si no existe, la crea.
 */
export async function iniciarRuteo(): Promise<Result<RuteoCierre>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const fecha = hoyARG()

    const { data: existente } = await supabase
      .from("ruteo_cierres")
      .select("id, estado")
      .eq("fecha", fecha)
      .maybeSingle()

    if (existente) {
      if ((existente as any).estado !== "pendiente") {
        return { error: "Ya hay un ruteo iniciado hoy." }
      }
      const { data, error } = await supabase
        .from("ruteo_cierres")
        .update({ estado: "en_curso", hora_inicio: new Date().toISOString() })
        .eq("id", (existente as any).id)
        .eq("estado", "pendiente")
        .select(SELECT_COLS)
        .single()
      if (error) return { error: error.message }
      revalidatePath("/ruteo")
      return { data: data as RuteoCierre }
    }

    const { data, error } = await supabase
      .from("ruteo_cierres")
      .insert({
        fecha,
        estado: "en_curso",
        hora_inicio: new Date().toISOString(),
        created_by: profile.id,
      })
      .select(SELECT_COLS)
      .single()

    if (error) {
      if (error.code === "23505") return { error: "Ya hay un ruteo iniciado hoy." }
      return { error: error.message }
    }
    revalidatePath("/ruteo")
    return { data: data as RuteoCierre }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/**
 * FIN DE PREVENTA: registra el horario en que Ventas entregó la preventa a
 * Ruteo (base del SLA Ventas↔Operaciones). Se puede registrar antes de iniciar
 * el ruteo (crea la fila del día en estado 'pendiente') o después. La hora se
 * toma del clic (now) o se ingresa a mano ("HH:MM", porque avisan por WhatsApp).
 */
export async function setFinPreventa(
  horaManual?: string,
): Promise<Result<RuteoCierre>> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const fecha = hoyARG()
    const ts = timestampARG(horaManual)

    const { data: existente } = await supabase
      .from("ruteo_cierres")
      .select("id")
      .eq("fecha", fecha)
      .maybeSingle()

    if (existente) {
      const { data, error } = await supabase
        .from("ruteo_cierres")
        .update({ hora_fin_preventa: ts })
        .eq("id", (existente as any).id)
        .select(SELECT_COLS)
        .single()
      if (error) return { error: error.message }
      revalidatePath("/ruteo")
      return { data: data as RuteoCierre }
    }

    const { data, error } = await supabase
      .from("ruteo_cierres")
      .insert({
        fecha,
        estado: "pendiente",
        hora_fin_preventa: ts,
        created_by: profile.id,
      })
      .select(SELECT_COLS)
      .single()

    if (error) {
      if (error.code === "23505") {
        // carrera: otra escritura creó la fila; reintentar como update
        const { data: d2, error: e2 } = await supabase
          .from("ruteo_cierres")
          .update({ hora_fin_preventa: ts })
          .eq("fecha", fecha)
          .select(SELECT_COLS)
          .single()
        if (e2) return { error: e2.message }
        revalidatePath("/ruteo")
        return { data: d2 as RuteoCierre }
      }
      return { error: error.message }
    }
    revalidatePath("/ruteo")
    return { data: data as RuteoCierre }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/**
 * FIN DE RUTEO: setea hora_fin = now(), estado = 'cerrado' y los datos por
 * ciudad. Solo cierra una fila que esté 'en_curso'.
 */
export async function finalizarRuteo(
  input: FinRuteoInput
): Promise<Result<RuteoCierre>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .update({
        estado: "cerrado",
        hora_fin: new Date().toISOString(),
        pergamino_bultos: toIntNoNeg(input.pergamino_bultos),
        pergamino_clientes: toIntNoNeg(input.pergamino_clientes),
        ramallo_bultos: toIntNoNeg(input.ramallo_bultos),
        ramallo_clientes: toIntNoNeg(input.ramallo_clientes),
        bultos_no_ruteados: toIntNoNeg(input.bultos_no_ruteados),
        notas: input.notas?.trim() || null,
      })
      .eq("id", input.id)
      .eq("estado", "en_curso")
      .select(SELECT_COLS)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: "El ruteo ya fue cerrado o no existe." }
    revalidatePath("/ruteo")
    return { data: data as RuteoCierre }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Historial de cierres anteriores (más recientes primero). */
export async function listarRuteoHistorial(
  limit = 60
): Promise<Result<RuteoCierre[]>> {
  try {
    await requireRole(["admin", "supervisor"])
    if (IS_MISIONES) return { error: SOLO_PAMPEANA }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("ruteo_cierres")
      .select(SELECT_COLS)
      .eq("estado", "cerrado")
      .order("fecha", { ascending: false })
      .limit(limit)

    if (error) return { error: error.message }
    return { data: (data ?? []) as RuteoCierre[] }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

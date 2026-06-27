"use server"

import { revalidatePath } from "next/cache"
import { addDays, addMonths, addWeeks, format, parse } from "date-fns"
import { createClient } from "@/lib/supabase/server"
import { requireRole } from "@/lib/session"
import type { AgendaEvento, AgendaEventoInput, Recurrencia } from "@/lib/agenda"
import { CATEGORIAS } from "@/lib/agenda"

type Result<T> = { data: T } | { error: string }
type Ok = { success: true } | { error: string }

const ROLES_AGENDA = ["admin", "supervisor"] as const
const RECURRENCIAS: Recurrencia[] = ["ninguna", "diaria", "semanal", "mensual"]

const COLUMNS =
  "id, titulo, descripcion, fecha, todo_el_dia, hora_inicio, hora_fin, categoria, responsable, ubicacion, recurrencia, recurrencia_hasta, creado_por, created_at, updated_at"

function parseISO(iso: string): Date {
  return parse(iso, "yyyy-MM-dd", new Date())
}

/** Avanza una fecha según el tipo de recurrencia. */
function siguiente(d: Date, r: Recurrencia): Date {
  if (r === "diaria") return addDays(d, 1)
  if (r === "semanal") return addWeeks(d, 1)
  if (r === "mensual") return addMonths(d, 1)
  return addDays(d, 1)
}

/**
 * Expande un evento maestro en sus ocurrencias dentro de [desde, hasta].
 * Para eventos no recurrentes devuelve una sola instancia (fecha_base = fecha).
 */
function expandir(ev: AgendaEvento, desde: string, hasta: string): AgendaEvento[] {
  if (ev.recurrencia === "ninguna") {
    return [{ ...ev, fecha_base: ev.fecha }]
  }
  const desdeD = parseISO(desde)
  const hastaD = parseISO(hasta)
  const corte = ev.recurrencia_hasta ? parseISO(ev.recurrencia_hasta) : hastaD
  const fin = corte < hastaD ? corte : hastaD

  const out: AgendaEvento[] = []
  let cur = parseISO(ev.fecha)
  let guard = 0
  while (cur <= fin && guard < 1000) {
    if (cur >= desdeD) {
      out.push({ ...ev, fecha: format(cur, "yyyy-MM-dd"), fecha_base: ev.fecha })
    }
    cur = siguiente(cur, ev.recurrencia)
    guard++
  }
  return out
}

/** Normaliza/valida el payload del formulario antes de escribir. */
function sanitizar(input: AgendaEventoInput): AgendaEventoInput | string {
  const titulo = input.titulo?.trim()
  if (!titulo) return "El título es obligatorio."
  if (!input.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha))
    return "La fecha no es válida."
  if (!(input.categoria in CATEGORIAS)) return "Categoría inválida."

  const recurrencia: Recurrencia = RECURRENCIAS.includes(input.recurrencia)
    ? input.recurrencia
    : "ninguna"
  const recurrenciaHasta =
    recurrencia === "ninguna" ? null : input.recurrencia_hasta || null
  if (recurrenciaHasta && recurrenciaHasta < input.fecha)
    return "La fecha de corte de la repetición no puede ser anterior a la fecha del evento."

  const todoElDia = Boolean(input.todo_el_dia)
  const horaInicio = todoElDia ? null : input.hora_inicio || null
  const horaFin = todoElDia ? null : input.hora_fin || null
  if (horaInicio && horaFin && horaFin < horaInicio)
    return "La hora de fin no puede ser anterior a la de inicio."

  return {
    titulo,
    descripcion: input.descripcion?.trim() || null,
    fecha: input.fecha,
    todo_el_dia: todoElDia,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    categoria: input.categoria,
    responsable: input.responsable?.trim() || null,
    ubicacion: input.ubicacion?.trim() || null,
    recurrencia,
    recurrencia_hasta: recurrenciaHasta,
  }
}

// ============================================================================
// Listado por rango de fechas (el calendario precarga el mes visible).
// Expande las series recurrentes en sus ocurrencias dentro del rango.
// ============================================================================
export async function listarEventosEnRango(
  desde: string,
  hasta: string,
): Promise<Result<AgendaEvento[]>> {
  try {
    await requireRole([...ROLES_AGENDA])
    const supabase = await createClient()

    // No recurrentes: solo los que caen dentro del rango.
    const sueltos = await supabase
      .from("agenda_eventos")
      .select(COLUMNS)
      .eq("recurrencia", "ninguna")
      .gte("fecha", desde)
      .lte("fecha", hasta)
    if (sueltos.error) return { error: sueltos.error.message }

    // Recurrentes que pueden solapar el rango (empiezan antes del fin y no
    // tienen corte previo al inicio).
    const recurrentes = await supabase
      .from("agenda_eventos")
      .select(COLUMNS)
      .neq("recurrencia", "ninguna")
      .lte("fecha", hasta)
      .or(`recurrencia_hasta.is.null,recurrencia_hasta.gte.${desde}`)
    if (recurrentes.error) return { error: recurrentes.error.message }

    const instancias: AgendaEvento[] = [
      ...((sueltos.data ?? []) as AgendaEvento[]).map((e) => ({
        ...e,
        fecha_base: e.fecha,
      })),
      ...((recurrentes.data ?? []) as AgendaEvento[]).flatMap((e) =>
        expandir(e, desde, hasta),
      ),
    ]

    instancias.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
      return (a.hora_inicio ?? "").localeCompare(b.hora_inicio ?? "")
    })

    return { data: instancias }
  } catch {
    return { error: "No autorizado." }
  }
}

// ============================================================================
// Crear
// ============================================================================
export async function crearEvento(
  input: AgendaEventoInput,
): Promise<Result<AgendaEvento>> {
  try {
    const profile = await requireRole([...ROLES_AGENDA])
    const limpio = sanitizar(input)
    if (typeof limpio === "string") return { error: limpio }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("agenda_eventos")
      .insert({ ...limpio, creado_por: profile.id })
      .select(COLUMNS)
      .single()

    if (error) return { error: error.message }
    revalidatePath("/agenda")
    return { data: data as AgendaEvento }
  } catch {
    return { error: "No autorizado." }
  }
}

// ============================================================================
// Actualizar (afecta a toda la serie si es recurrente)
// ============================================================================
export async function actualizarEvento(
  id: string,
  input: AgendaEventoInput,
): Promise<Result<AgendaEvento>> {
  try {
    await requireRole([...ROLES_AGENDA])
    if (!id) return { error: "Falta el identificador del evento." }
    const limpio = sanitizar(input)
    if (typeof limpio === "string") return { error: limpio }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("agenda_eventos")
      .update({ ...limpio, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single()

    if (error) return { error: error.message }
    revalidatePath("/agenda")
    return { data: data as AgendaEvento }
  } catch {
    return { error: "No autorizado." }
  }
}

// ============================================================================
// Eliminar (borra la serie completa si es recurrente)
// ============================================================================
export async function eliminarEvento(id: string): Promise<Ok> {
  try {
    await requireRole([...ROLES_AGENDA])
    if (!id) return { error: "Falta el identificador del evento." }

    const supabase = await createClient()
    const { error } = await supabase.from("agenda_eventos").delete().eq("id", id)
    if (error) return { error: error.message }

    revalidatePath("/agenda")
    return { success: true }
  } catch {
    return { error: "No autorizado." }
  }
}

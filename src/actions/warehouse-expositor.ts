"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, getProfile } from "@/lib/session"
import type { Profile } from "@/types/database"

// =============================================
// Reunión Warehouse · sorteo del expositor del día
// =============================================
// La reunión la abre un operador distinto cada día. El sorteo corre en el
// servidor (el cliente no elige) y respeta la rotación: sólo compiten los que
// menos veces expusieron, así no le toca dos veces al mismo antes de que
// pasen todos.

export interface OperadorPlantel {
  id: string
  nombre: string
  activo: boolean
  nota: string | null
  /** Veces que expuso de verdad (historia, sin el crédito de reingreso). */
  veces: number
  ultima_vez: string | null
  /** Volvió hoy de una ausencia: mira la reunión, no la da. */
  vuelve_hoy: boolean
}

export interface TurnoExpositor {
  fecha: string
  nombre: string
}

export interface EstadoExpositor {
  hoy: string
  turnoHoy: TurnoExpositor | null
  plantel: OperadorPlantel[]
  historial: TurnoExpositor[]
  puedeSortear: boolean
}

type Result<T> = { data: T } | { error: string }

const ROLES_EDITORES = ["admin", "supervisor", "admin_rrhh"]

async function requireEditor(): Promise<Profile> {
  const profile = await requireAuth()
  if (!ROLES_EDITORES.includes(profile.role)) {
    throw new Error("No tenés permiso para sortear el expositor")
  }
  return profile
}

/** Fecha de hoy en hora de Argentina (YYYY-MM-DD). */
function hoyAR(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

export async function getEstadoExpositor(): Promise<Result<EstadoExpositor>> {
  try {
    await requireAuth()
    const profile = await getProfile()
    const supabase = await createClient()
    const hoy = hoyAR()

    const [plantelRes, turnosRes] = await Promise.all([
      supabase
        .from("warehouse_expositor_plantel")
        .select("id, nombre, activo, nota, reingreso_fecha")
        .order("nombre"),
      supabase
        .from("warehouse_expositor_turnos")
        .select("fecha, nombre")
        .order("fecha", { ascending: false })
        .limit(400),
    ])

    if (plantelRes.error) return { error: plantelRes.error.message }
    if (turnosRes.error) return { error: turnosRes.error.message }

    const turnos = (turnosRes.data ?? []) as TurnoExpositor[]

    // Veces que expuso cada uno + la última fecha (los turnos vienen DESC,
    // así que el primero que aparece es el más reciente).
    const veces = new Map<string, number>()
    const ultima = new Map<string, string>()
    for (const t of turnos) {
      veces.set(t.nombre, (veces.get(t.nombre) ?? 0) + 1)
      if (!ultima.has(t.nombre)) ultima.set(t.nombre, t.fecha)
    }

    const plantel: OperadorPlantel[] = (plantelRes.data ?? []).map((o) => ({
      id: o.id as string,
      nombre: o.nombre as string,
      activo: o.activo as boolean,
      nota: (o.nota as string | null) ?? null,
      veces: veces.get(o.nombre as string) ?? 0,
      ultima_vez: ultima.get(o.nombre as string) ?? null,
      vuelve_hoy: (o.reingreso_fecha as string | null) === hoy,
    }))

    return {
      data: {
        hoy,
        turnoHoy: turnos.find((t) => t.fecha === hoy) ?? null,
        plantel,
        historial: turnos.slice(0, 15),
        puedeSortear: !!profile && ROLES_EDITORES.includes(profile.role),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function sortearExpositorHoy(): Promise<Result<TurnoExpositor>> {
  try {
    const profile = await requireEditor()
    const supabase = await createClient()
    const hoy = hoyAR()

    const { data: plantel, error: errPlantel } = await supabase
      .from("warehouse_expositor_plantel")
      .select("nombre, veces_offset, reingreso_fecha")
      .eq("activo", true)

    if (errPlantel) return { error: errPlantel.message }

    const activos = plantel ?? []
    if (activos.length === 0) {
      return {
        error:
          "No hay operadores disponibles: están todos marcados como ausentes.",
      }
    }

    // El que volvió hoy de una ausencia mira la reunión, no la da: recién
    // entra al sorteo a partir de mañana.
    const vuelvenHoy = activos
      .filter((o) => (o.reingreso_fecha as string | null) === hoy)
      .map((o) => o.nombre as string)

    const disponibles = activos
      .filter((o) => !vuelvenHoy.includes(o.nombre as string))
      .map((o) => o.nombre as string)

    if (disponibles.length === 0) {
      return {
        error:
          vuelvenHoy.length > 0
            ? `Hoy vuelve ${vuelvenHoy.join(" y ")} de una ausencia y no hay nadie más disponible. El primer día no exponen.`
            : "No hay operadores disponibles: están todos marcados como ausentes.",
      }
    }

    const offsets = new Map<string, number>(
      activos.map((o) => [o.nombre as string, (o.veces_offset as number) ?? 0]),
    )

    const { data: turnos, error: errTurnos } = await supabase
      .from("warehouse_expositor_turnos")
      .select("fecha, nombre")
      .order("fecha", { ascending: false })
      .limit(400)

    if (errTurnos) return { error: errTurnos.message }

    const historial = (turnos ?? []) as TurnoExpositor[]
    const veces = new Map<string, number>()
    for (const t of historial) {
      veces.set(t.nombre, (veces.get(t.nombre) ?? 0) + 1)
    }

    // Rotación pareja: compiten sólo los que menos veces expusieron. Al que
    // volvió de una ausencia se le suma el crédito que se le acreditó al
    // reactivarlo, así entra en el punto de la rueda donde está el grupo en
    // vez de salir sorteado varias veces seguidas por tener 0 exposiciones.
    const vecesEfectivas = (n: string) =>
      (veces.get(n) ?? 0) + (offsets.get(n) ?? 0)

    const minimo = Math.min(...disponibles.map(vecesEfectivas))
    let candidatos = disponibles.filter((n) => vecesEfectivas(n) === minimo)

    // Si es un "volver a sortear", no repetimos al que ya salió hoy.
    const yaHoy = historial.find((t) => t.fecha === hoy)
    if (yaHoy && candidatos.length > 1) {
      const otros = candidatos.filter((n) => n !== yaHoy.nombre)
      if (otros.length > 0) candidatos = otros
    }

    const ganador =
      candidatos[Math.floor(Math.random() * candidatos.length)]

    const { error: errUpsert } = await supabase
      .from("warehouse_expositor_turnos")
      .upsert(
        {
          fecha: hoy,
          nombre: ganador,
          sorteado_por: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fecha" },
      )

    if (errUpsert) return { error: errUpsert.message }

    revalidatePath("/reuniones")
    return { data: { fecha: hoy, nombre: ganador } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

/**
 * Exposiciones a acreditarle al que vuelve, para que entre parejo: el promedio
 * de veces efectivas de los que ya venían dando la reunión, menos las que él
 * ya tenía. Nunca negativo (si expuso más que el promedio, no se le descuenta).
 */
async function creditoDeReingreso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<number> {
  const { data: fila } = await supabase
    .from("warehouse_expositor_plantel")
    .select("nombre")
    .eq("id", id)
    .single()

  const nombre = (fila?.nombre as string | undefined) ?? null
  if (!nombre) return 0

  const { data: plantel } = await supabase
    .from("warehouse_expositor_plantel")
    .select("nombre, veces_offset")
    .eq("activo", true)

  const { data: turnos } = await supabase
    .from("warehouse_expositor_turnos")
    .select("nombre")
    .limit(400)

  const veces = new Map<string, number>()
  for (const t of turnos ?? []) {
    const n = t.nombre as string
    veces.set(n, (veces.get(n) ?? 0) + 1)
  }

  // El grupo contra el que se compara: los que ya estaban activos (él todavía
  // figura inactivo en este punto, así que no se cuenta a sí mismo).
  const grupo = (plantel ?? []).filter((o) => (o.nombre as string) !== nombre)
  if (grupo.length === 0) return 0

  const efectivas = grupo.map(
    (o) => (veces.get(o.nombre as string) ?? 0) + ((o.veces_offset as number) ?? 0),
  )
  const promedio = efectivas.reduce((a, b) => a + b, 0) / efectivas.length

  return Math.max(0, Math.round(promedio) - (veces.get(nombre) ?? 0))
}

export async function setDisponibilidadOperador(
  id: string,
  activo: boolean,
  nota?: string | null,
): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()
    const hoy = hoyAR()

    const cambios: Record<string, unknown> = {
      activo,
      nota: activo ? null : (nota?.trim() || "Ausente"),
      updated_at: new Date().toISOString(),
    }

    if (activo) {
      // Vuelve de una ausencia: se le acredita el promedio de exposiciones del
      // grupo para que entre parejo (si no, con 0 en el contador saldría
      // sorteado varias veces seguidas), y hoy queda fuera del sorteo.
      cambios.veces_offset = await creditoDeReingreso(supabase, id)
      cambios.reingreso_fecha = hoy
    } else {
      // Se va: el crédito viejo no debe sobrevivir a la próxima vuelta, se
      // recalcula recién cuando reingrese.
      cambios.veces_offset = 0
      cambios.reingreso_fecha = null
    }

    const { error } = await supabase
      .from("warehouse_expositor_plantel")
      .update(cambios)
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/reuniones")
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

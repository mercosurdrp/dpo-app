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
  veces: number
  ultima_vez: string | null
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
        .select("id, nombre, activo, nota")
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
      .select("nombre")
      .eq("activo", true)

    if (errPlantel) return { error: errPlantel.message }

    const disponibles = (plantel ?? []).map((o) => o.nombre as string)
    if (disponibles.length === 0) {
      return {
        error:
          "No hay operadores disponibles: están todos marcados como ausentes.",
      }
    }

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

    // Rotación pareja: compiten sólo los que menos veces expusieron.
    const minimo = Math.min(...disponibles.map((n) => veces.get(n) ?? 0))
    let candidatos = disponibles.filter((n) => (veces.get(n) ?? 0) === minimo)

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

export async function setDisponibilidadOperador(
  id: string,
  activo: boolean,
  nota?: string | null,
): Promise<Result<true>> {
  try {
    await requireEditor()
    const supabase = await createClient()

    const { error } = await supabase
      .from("warehouse_expositor_plantel")
      .update({
        activo,
        nota: activo ? null : (nota?.trim() || "Ausente"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (error) return { error: error.message }

    revalidatePath("/reuniones")
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

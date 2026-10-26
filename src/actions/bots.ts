"use server"

// Bots por pilar: pantalla /bots. Lectura de corridas y planes propuestos,
// aprobar (crea el plan real en planes_accion) / descartar, y correr una
// ronda o una reunión de prueba sin mandar WhatsApp. Ver src/lib/bots/.

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { aprobarPropuesta, descartarPropuesta } from "@/lib/bots/planes"
import { correrReunion } from "@/lib/bots/reunion"
import { cargarBots, correrRonda } from "@/lib/bots/ronda"
import type { BotCorrida, BotPilar, BotPlanPropuesto } from "@/lib/bots/tipos"

type Result<T> = { data: T } | { error: string }

const ROLES = ["admin", "supervisor"] as const

export interface BotsData {
  bots: BotPilar[]
  corridas: BotCorrida[]
  planes: BotPlanPropuesto[]
}

export async function getBotsData(): Promise<Result<BotsData>> {
  try {
    await requireRole([...ROLES])
    const supabase = createAdminClient()
    const [bots, corridas, planes] = await Promise.all([
      supabase.from("bots_pilar").select("*").order("key"),
      supabase
        .from("bots_corridas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("bots_planes_propuestos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ])
    const err = bots.error ?? corridas.error ?? planes.error
    if (err) return { error: err.message }
    return {
      data: {
        bots: (bots.data ?? []) as BotPilar[],
        corridas: (corridas.data ?? []) as BotCorrida[],
        planes: (planes.data ?? []) as BotPlanPropuesto[],
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error cargando los bots" }
  }
}

export async function aprobarPlanPropuesto(id: string): Promise<Result<{ planId: string }>> {
  try {
    const profile = await requireRole([...ROLES])
    const r = await aprobarPropuesta(createAdminClient(), id, profile)
    if ("error" in r) return r
    revalidatePath("/bots")
    revalidatePath("/planes")
    return { data: { planId: r.data.planId } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error aprobando el plan" }
  }
}

export async function descartarPlanPropuesto(id: string): Promise<Result<true>> {
  try {
    const profile = await requireRole([...ROLES])
    const r = await descartarPropuesta(createAdminClient(), id, profile.id)
    if ("error" in r) return r
    revalidatePath("/bots")
    return { data: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error descartando el plan" }
  }
}

/** Ronda de prueba: arma el mensaje con los datos de hoy pero NO lo manda. */
export async function probarRonda(botKey: string): Promise<Result<{ mensaje: string; modo: string }>> {
  try {
    await requireRole([...ROLES])
    const [bot] = await cargarBots(botKey)
    if (!bot) return { error: "Bot inexistente o inactivo" }
    const r = await correrRonda(bot, { dry: true })
    revalidatePath("/bots")
    return { data: { mensaje: r.mensaje, modo: r.modo } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error corriendo la ronda" }
  }
}

/** Reunión de prueba con las rondas de hoy: arma el acta pero NO la manda. */
export async function probarReunion(): Promise<Result<{ mensaje: string }>> {
  try {
    await requireRole([...ROLES])
    const r = await correrReunion(await cargarBots(), { dry: true })
    revalidatePath("/bots")
    return { data: { mensaje: r.mensaje ?? r.omitida ?? "Sin reunión." } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error corriendo la reunión" }
  }
}

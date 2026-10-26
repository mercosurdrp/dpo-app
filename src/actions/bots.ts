"use server"

// Bots por pilar: pantalla /bots. Lectura de corridas y planes propuestos,
// aprobar (crea el plan real en planes_accion) / descartar, y correr una
// ronda de prueba sin mandar WhatsApp. Ver src/lib/bots/.

import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { cargarBots, correrRonda } from "@/lib/bots/ronda"
import { hoyArgentina } from "@/lib/warehouse/auto-indicadores"
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
    const supabase = createAdminClient()

    const { data: row, error } = await supabase
      .from("bots_planes_propuestos")
      .select("*")
      .eq("id", id)
      .single()
    if (error || !row) return { error: error?.message ?? "No se encontró la propuesta" }
    const prop = row as BotPlanPropuesto
    if (prop.estado !== "propuesto") return { error: "La propuesta ya fue resuelta" }

    const { data: bot } = await supabase
      .from("bots_pilar")
      .select("nombre, encargado_profile_id")
      .eq("key", prop.bot_key)
      .single()
    const b = bot as { nombre: string; encargado_profile_id: string | null } | null
    const responsableId = b?.encargado_profile_id ?? profile.id

    const notas = [
      `Propuesto por el bot de ${b?.nombre ?? prop.bot_key} y aprobado por ${profile.nombre}.`,
      `Indicador: ${prop.indicador}.`,
      prop.causa_probable ? `Causa probable (a verificar): ${prop.causa_probable}.` : null,
      prop.responsable_sugerido ? `Responsable sugerido: ${prop.responsable_sugerido}.` : null,
    ]
      .filter(Boolean)
      .join("\n")

    // tipo 'auditoria' (no 'directa'): las directas son tareas de Mis Tareas y
    // no aparecen en /planes.
    const { data: plan, error: errPlan } = await supabase
      .from("planes_accion")
      .insert({
        pregunta_id: null,
        tipo: "auditoria",
        titulo: prop.titulo,
        descripcion: prop.accion,
        responsable: "",
        fecha_inicio: hoyArgentina(),
        fecha_limite: prop.fecha_objetivo,
        estado: "pendiente",
        prioridad: "alta",
        progreso: 0,
        notas,
        created_by: profile.id,
      })
      .select("id")
      .single()
    if (errPlan || !plan) return { error: errPlan?.message ?? "No se pudo crear el plan" }
    const planId = (plan as { id: string }).id

    const { error: errResp } = await supabase
      .from("plan_responsables")
      .insert({ plan_id: planId, profile_id: responsableId, rol: "responsable_principal" })
    if (errResp) {
      await supabase.from("planes_accion").delete().eq("id", planId)
      return { error: `No se pudo asignar el responsable: ${errResp.message}` }
    }

    const { error: errUpd } = await supabase
      .from("bots_planes_propuestos")
      .update({
        estado: "aprobado",
        plan_accion_id: planId,
        resuelto_por: profile.id,
        resuelto_at: new Date().toISOString(),
      })
      .eq("id", id)
    if (errUpd) return { error: errUpd.message }

    revalidatePath("/bots")
    revalidatePath("/planes")
    return { data: { planId } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error aprobando el plan" }
  }
}

export async function descartarPlanPropuesto(id: string): Promise<Result<true>> {
  try {
    const profile = await requireRole([...ROLES])
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("bots_planes_propuestos")
      .update({
        estado: "descartado",
        resuelto_por: profile.id,
        resuelto_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("estado", "propuesto")
    if (error) return { error: error.message }
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

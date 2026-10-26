// Planes que proponen los bots: numeración del día (para aprobarlos por
// WhatsApp con «sí 3»), aprobar (crea el plan real en planes_accion) y
// descartar. Lo usan la pantalla /bots y el webhook de WhatsApp.

import { createAdminClient } from "@/lib/supabase/admin"
import { hoyArgentina } from "@/lib/warehouse/auto-indicadores"
import type { BotPlanPropuesto } from "./tipos"

type Admin = ReturnType<typeof createAdminClient>
type Result<T> = { data: T } | { error: string }

/** Próximo número libre del día: los números se reinician cada día. */
export async function proximoNumero(supabase: Admin, fecha: string): Promise<number> {
  const { data, error } = await supabase
    .from("bots_planes_propuestos")
    .select("numero")
    .eq("fecha", fecha)
    .not("numero", "is", null)
    .order("numero", { ascending: false })
    .limit(1)
  if (error) throw new Error(`bots_planes_propuestos: ${error.message}`)
  return ((data?.[0] as { numero: number } | undefined)?.numero ?? 0) + 1
}

/** Cierre del mensaje: los planes numerados y cómo responder. */
export function lineasPlanes(planes: Array<{ numero: number; titulo: string }>): string[] {
  if (planes.length === 0) return []
  const n = planes[0].numero
  return [
    "",
    `📝 *Planes propuestos* (respondé *sí ${n}* para aprobarlo o *no ${n}* para descartarlo; también desde /bots):`,
    ...planes.map((p) => `*${p.numero}.* ${p.titulo}`),
  ]
}

/**
 * Aprueba una propuesta: crea el plan en planes_accion (tipo 'auditoria',
 * porque las 'directa' son tareas y no aparecen en /planes) con el encargado
 * del bot como responsable, y marca la propuesta como aprobada.
 */
export async function aprobarPropuesta(
  supabase: Admin,
  id: string,
  aprobador: { id: string; nombre: string },
): Promise<Result<{ planId: string; titulo: string }>> {
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
  const responsableId = b?.encargado_profile_id ?? aprobador.id

  const notas = [
    `Propuesto por el bot de ${b?.nombre ?? prop.bot_key} y aprobado por ${aprobador.nombre}.`,
    `Indicador: ${prop.indicador}.`,
    prop.causa_probable ? `Causa probable (a verificar): ${prop.causa_probable}.` : null,
    prop.responsable_sugerido ? `Responsable sugerido: ${prop.responsable_sugerido}.` : null,
  ]
    .filter(Boolean)
    .join("\n")

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
      created_by: aprobador.id,
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
      resuelto_por: aprobador.id,
      resuelto_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (errUpd) return { error: errUpd.message }
  return { data: { planId, titulo: prop.titulo } }
}

export async function descartarPropuesta(
  supabase: Admin,
  id: string,
  profileId: string,
): Promise<Result<true>> {
  const { data, error } = await supabase
    .from("bots_planes_propuestos")
    .update({
      estado: "descartado",
      resuelto_por: profileId,
      resuelto_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("estado", "propuesto")
    .select("id")
  if (error) return { error: error.message }
  if (!data?.length) return { error: "La propuesta ya fue resuelta" }
  return { data: true }
}

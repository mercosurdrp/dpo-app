"use server"

import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import {
  avisarLiberacionManual,
  getBloqueosCriticos,
  type CamionBloqueado,
} from "@/lib/vehiculos/bloqueo-critico"

/** Camiones bloqueados hoy por un crítico del checklist (portería / flota). */
export async function getCamionesBloqueados(): Promise<
  { data: CamionBloqueado[] } | { error: string }
> {
  try {
    await requireAuth()
    const m = await getBloqueosCriticos()
    return { data: [...m.values()].sort((a, b) => a.dominio.localeCompare(b.dominio)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

/**
 * Libera un camión bloqueado SIN reparación (falsa alarma, el chofer marcó mal,
 * el defecto no impide salir). Cierra como «resuelto» el plan de acción de cada
 * crítico abierto con el motivo escrito, así el tablero de mantenimiento cuenta
 * por qué salió, y avisa por WhatsApp.
 */
export async function liberarCamionBloqueado(input: {
  dominio: string
  motivo: string
}): Promise<{ data: { planes: number } } | { error: string }> {
  try {
    const profile = await requireRole(["admin", "supervisor"])
    const motivo = (input.motivo || "").trim()
    if (motivo.length < 5) return { error: "Escribí por qué sale sin reparar" }
    const dominio = (input.dominio || "").trim().toUpperCase()

    const b = (await getBloqueosCriticos(dominio)).get(dominio)
    if (!b) return { error: `${dominio} no está bloqueado` }

    const supabase = await createClient()
    const descripcion = `Liberado sin reparación por ${profile.nombre}: ${motivo}`
    const ahora = new Date().toISOString()
    let planes = 0
    for (const i of b.items) {
      const { data: existente, error: errSel } = await supabase
        .from("checklist_planes_accion")
        .select("id")
        .eq("respuesta_id", i.respuestaId)
        .maybeSingle()
      if (errSel) return { error: errSel.message }
      const comunes = { tipo: "correctivo", estado: "resuelto", descripcion, updated_at: ahora }
      const { error } = existente
        ? await supabase.from("checklist_planes_accion").update(comunes).eq("id", existente.id)
        : await supabase
            .from("checklist_planes_accion")
            .insert({ respuesta_id: i.respuestaId, ...comunes, created_by: profile.id })
      if (error) return { error: error.message }
      planes++
    }

    after(() => avisarLiberacionManual(dominio, profile.nombre, motivo))
    return { data: { planes } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

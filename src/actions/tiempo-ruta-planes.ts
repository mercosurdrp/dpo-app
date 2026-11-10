"use server"

import { requireAuth } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { createPlanAccion } from "@/actions/gestion"
import { PREGUNTA_KEY, preguntaIdPorKey } from "@/lib/dpo/pregunta-por-key"
import type { PrioridadPlan } from "@/types/database"

// Planes de acción del tiempo en ruta (DPO Entrega 1.2, R1.2.5: "si el tiempo
// en ruta no cumple el objetivo, hay plan de acción"). Viven en planes_accion
// con la pregunta 1.2, igual que los del DQI con la 1.4; el mes queda en notas.
const PERIODO_RE = /tiempo_ruta_periodo=(\d{4})-(\d{2})/

export interface TiempoRutaPlan {
  id: string
  descripcion: string
  estado: string
  prioridad: string
  responsable: string | null
  fecha_limite: string | null
  year: number | null
  month: number | null
}

export async function getPlanesTiempoRuta(): Promise<{ data: TiempoRutaPlan[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const preguntaId = await preguntaIdPorKey(supabase, PREGUNTA_KEY.ENTREGA_1_2)
    if (!preguntaId) return { data: [] }
    const { data, error } = await supabase
      .from("planes_accion")
      .select("id, descripcion, estado, prioridad, notas, fecha_limite, responsable")
      .eq("pregunta_id", preguntaId)
      .order("created_at", { ascending: false })
    if (error) return { error: error.message }
    return {
      data: (data ?? []).map((p) => {
        const m = ((p.notas as string | null) ?? "").match(PERIODO_RE)
        return {
          id: p.id as string,
          descripcion: p.descripcion as string,
          estado: p.estado as string,
          prioridad: p.prioridad as string,
          responsable: (p.responsable as string | null) ?? null,
          fecha_limite: (p.fecha_limite as string | null) ?? null,
          year: m ? Number(m[1]) : null,
          month: m ? Number(m[2]) : null,
        }
      }),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export async function crearPlanTiempoRuta(input: {
  year: number
  month: number
  descripcion: string
  responsable: string
  fecha_limite?: string
  prioridad?: PrioridadPlan
}): Promise<{ ok: true } | { error: string }> {
  await requireAuth()
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }
  if (!input.responsable.trim()) return { error: "El responsable es obligatorio." }
  const supabase = await createClient()
  const preguntaId = await preguntaIdPorKey(supabase, PREGUNTA_KEY.ENTREGA_1_2)
  if (!preguntaId) return { error: "No se encontró el punto 1.2 de Entrega en el manual DPO." }
  const periodo = `${input.year}-${String(input.month).padStart(2, "0")}`
  const res = await createPlanAccion({
    pregunta_id: preguntaId,
    descripcion: input.descripcion.trim(),
    responsable: input.responsable.trim(),
    fecha_limite: input.fecha_limite || undefined,
    prioridad: input.prioridad ?? "media",
    notas: `tiempo_ruta_periodo=${periodo}`,
  })
  if ("error" in res) return { error: res.error }
  return { ok: true }
}

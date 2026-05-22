"use server"

// =============================================
// COMPAT — OWD del punto 1.1 PRE RUTA
// =============================================
// El módulo OWD se generalizó (ver src/actions/owd.ts): ahora cada punto del
// manual DPO tiene su propia plantilla. Este archivo queda como capa de
// compatibilidad para los consumidores que siguen razonando en términos del
// 1.1 PRE RUTA — principalmente el Pack de Auditoría 1.1 (pack-auditoria.ts),
// que llama getOwdKpis() sin argumentos.
//
// El punto 1.1 se resuelve por preguntas.key = '5_1_23_73' (estable entre
// tenants; el UUID NO lo es, se siembra con gen_random_uuid).

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { getOwdKpis as getOwdKpisByTemplate } from "./owd"

const KEY_1_1 = "5_1_23_73"

// Id de la plantilla OWD del 1.1 PRE RUTA, o null si la migración 078 aún no corrió.
export async function getTemplate11Id(): Promise<string | null> {
  await requireAuth()
  const supabase = await createClient()
  const { data: preg } = await supabase
    .from("preguntas")
    .select("id")
    .eq("key", KEY_1_1)
    .maybeSingle()
  if (!preg) return null
  const { data: tpl } = await supabase
    .from("owd_templates")
    .select("id")
    .eq("pregunta_id", preg.id)
    .maybeSingle()
  return tpl?.id ?? null
}

// Compat: KPIs OWD del 1.1 (mismo shape que antes; el pack los consume tal cual).
export async function getOwdKpis() {
  const templateId = await getTemplate11Id()
  if (!templateId) {
    return {
      data: {
        totalObservaciones: 0,
        promedioCumplimiento: 0,
        obsMesActual: 0,
        metaMensual: 8,
        metaCumplimiento: 90,
        mensual: [],
        porEtapa: [],
        itemsMasFallados: [],
      },
    }
  }
  return getOwdKpisByTemplate(templateId)
}

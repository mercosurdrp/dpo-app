"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import type {
  Bloque,
  Pregunta,
  Indicador,
  PlanAccion,
  Evidencia,
  CategoriaBloque,
  Tendencia,
  TipoEvidencia,
  EstadoPlan,
  PrioridadPlan,
} from "@/types/database"

// ---------- Types ----------

export interface PreguntaConCounts extends Pregunta {
  indicadores_count: number
  planes_count: number
  evidencias_count: number
  puntaje_actual: number | null
}

export interface BloqueConPreguntasGestion extends Bloque {
  preguntas: PreguntaConCounts[]
}

export interface CategoriaGroup {
  categoria: CategoriaBloque
  bloques: BloqueConPreguntasGestion[]
}

export interface PreguntaGestionFull extends Pregunta {
  bloque_nombre: string
  puntaje_actual: number | null
  indicadores: Indicador[]
  planes_accion: PlanAccion[]
  evidencias: Evidencia[]
}

// ---------- getPilarGestion ----------

export async function getPilarGestion(
  pilarId: string,
  auditoriaId?: string
): Promise<{ data: CategoriaGroup[] } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get bloques for this pilar
    const { data: bloques, error: bloquesErr } = await supabase
      .from("bloques")
      .select("*")
      .eq("pilar_id", pilarId)
      .order("orden")

    if (bloquesErr) return { error: bloquesErr.message }

    const bloquesArr = (bloques ?? []) as Bloque[]
    const bloqueIds = bloquesArr.map((b) => b.id)

    if (bloqueIds.length === 0) {
      return {
        data: [
          { categoria: "fundamentales", bloques: [] },
          { categoria: "mantener", bloques: [] },
          { categoria: "mejorar", bloques: [] },
        ],
      }
    }

    // Get preguntas
    const { data: preguntas, error: pregErr } = await supabase
      .from("preguntas")
      .select("*")
      .in("bloque_id", bloqueIds)
      .order("numero")

    if (pregErr) return { error: pregErr.message }

    const preguntasArr = (preguntas ?? []) as Pregunta[]
    const preguntaIds = preguntasArr.map((p) => p.id)

    // Get counts for each pregunta
    let indicadoresCounts = new Map<string, number>()
    let planesCounts = new Map<string, number>()
    let evidenciasCounts = new Map<string, number>()
    let puntajeMap = new Map<string, number | null>()

    if (preguntaIds.length > 0) {
      // Indicadores count
      const { data: indData } = await supabase
        .from("indicadores")
        .select("pregunta_id")
        .in("pregunta_id", preguntaIds)

      for (const row of indData ?? []) {
        indicadoresCounts.set(
          row.pregunta_id,
          (indicadoresCounts.get(row.pregunta_id) ?? 0) + 1
        )
      }

      // Planes count
      const { data: planData } = await supabase
        .from("planes_accion")
        .select("pregunta_id")
        .in("pregunta_id", preguntaIds)

      for (const row of planData ?? []) {
        planesCounts.set(
          row.pregunta_id,
          (planesCounts.get(row.pregunta_id) ?? 0) + 1
        )
      }

      // Evidencias count
      const { data: evData } = await supabase
        .from("evidencias")
        .select("pregunta_id")
        .in("pregunta_id", preguntaIds)

      for (const row of evData ?? []) {
        evidenciasCounts.set(
          row.pregunta_id,
          (evidenciasCounts.get(row.pregunta_id) ?? 0) + 1
        )
      }

      // Get latest audit puntajes if auditoriaId provided
      if (auditoriaId) {
        const { data: respuestas } = await supabase
          .from("respuestas")
          .select("pregunta_id, puntaje")
          .eq("auditoria_id", auditoriaId)
          .in("pregunta_id", preguntaIds)

        for (const r of respuestas ?? []) {
          puntajeMap.set(r.pregunta_id, r.puntaje)
        }
      } else {
        // Get from latest audit
        const { data: latestAudit } = await supabase
          .from("auditorias")
          .select("id")
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        if (latestAudit) {
          const { data: respuestas } = await supabase
            .from("respuestas")
            .select("pregunta_id, puntaje")
            .eq("auditoria_id", latestAudit.id)
            .in("pregunta_id", preguntaIds)

          for (const r of respuestas ?? []) {
            puntajeMap.set(r.pregunta_id, r.puntaje)
          }
        }
      }
    }

    // Group preguntas by bloque
    const preguntasByBloque = new Map<string, PreguntaConCounts[]>()
    for (const p of preguntasArr) {
      const preguntaConCounts: PreguntaConCounts = {
        ...p,
        indicadores_count: indicadoresCounts.get(p.id) ?? 0,
        planes_count: planesCounts.get(p.id) ?? 0,
        evidencias_count: evidenciasCounts.get(p.id) ?? 0,
        puntaje_actual: puntajeMap.get(p.id) ?? null,
      }
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(preguntaConCounts)
      preguntasByBloque.set(p.bloque_id, list)
    }

    // Group bloques by categoria
    const categorias: CategoriaBloque[] = ["fundamentales", "mantener", "mejorar"]
    const result: CategoriaGroup[] = categorias.map((cat) => ({
      categoria: cat,
      bloques: bloquesArr
        .filter((b) => (b.categoria ?? "fundamentales") === cat)
        .map((b) => ({
          ...b,
          preguntas: preguntasByBloque.get(b.id) ?? [],
        })),
    }))

    return { data: result }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading pilar gestion",
    }
  }
}

// ---------- getPreguntaGestion ----------

export async function getPreguntaGestion(
  preguntaId: string
): Promise<{ data: PreguntaGestionFull } | { error: string }> {
  try {
    const supabase = await createClient()

    // Get pregunta
    const { data: pregunta, error: pregErr } = await supabase
      .from("preguntas")
      .select("*")
      .eq("id", preguntaId)
      .single()

    if (pregErr || !pregunta) {
      return { error: pregErr?.message ?? "Pregunta no encontrada" }
    }

    // Get bloque name
    const { data: bloque } = await supabase
      .from("bloques")
      .select("nombre")
      .eq("id", pregunta.bloque_id)
      .single()

    // Get indicadores
    const { data: indicadores } = await supabase
      .from("indicadores")
      .select("*")
      .eq("pregunta_id", preguntaId)
      .order("created_at")

    // Get planes
    const { data: planes } = await supabase
      .from("planes_accion")
      .select("*")
      .eq("pregunta_id", preguntaId)
      .order("created_at")

    // Get evidencias
    const { data: evidencias } = await supabase
      .from("evidencias")
      .select("*")
      .eq("pregunta_id", preguntaId)
      .order("created_at")

    // Get latest puntaje
    const { data: latestAudit } = await supabase
      .from("auditorias")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    let puntaje_actual: number | null = null
    if (latestAudit) {
      const { data: resp } = await supabase
        .from("respuestas")
        .select("puntaje")
        .eq("auditoria_id", latestAudit.id)
        .eq("pregunta_id", preguntaId)
        .single()

      if (resp) puntaje_actual = resp.puntaje
    }

    const result: PreguntaGestionFull = {
      ...(pregunta as Pregunta),
      bloque_nombre: bloque?.nombre ?? "",
      puntaje_actual,
      indicadores: (indicadores ?? []) as Indicador[],
      planes_accion: (planes ?? []) as PlanAccion[],
      evidencias: (evidencias ?? []) as Evidencia[],
    }

    return { data: result }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error loading pregunta gestion",
    }
  }
}

// ---------- Indicador CRUD ----------

export async function createIndicador(data: {
  pregunta_id: string
  nombre: string
  meta: number
  actual: number
  unidad?: string
  tendencia?: Tendencia
  notas?: string
}): Promise<{ data: Indicador } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: indicador, error } = await supabase
      .from("indicadores")
      .insert({
        pregunta_id: data.pregunta_id,
        nombre: data.nombre,
        meta: data.meta,
        actual: data.actual,
        unidad: data.unidad ?? "%",
        tendencia: data.tendencia ?? "neutral",
        notas: data.notas ?? null,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: indicador as Indicador }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating indicador" }
  }
}

export async function updateIndicador(
  id: string,
  data: {
    nombre?: string
    meta?: number
    actual?: number
    unidad?: string
    tendencia?: Tendencia
    notas?: string
  }
): Promise<{ data: Indicador } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: indicador, error } = await supabase
      .from("indicadores")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: indicador as Indicador }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating indicador" }
  }
}

export async function deleteIndicador(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("indicadores").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting indicador" }
  }
}

// ---------- PlanAccion CRUD ----------

export async function createPlanAccion(data: {
  pregunta_id: string
  descripcion: string
  responsable: string
  fecha_inicio?: string
  fecha_limite?: string
  prioridad?: PrioridadPlan
  notas?: string
}): Promise<{ data: PlanAccion } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: plan, error } = await supabase
      .from("planes_accion")
      .insert({
        pregunta_id: data.pregunta_id,
        descripcion: data.descripcion,
        responsable: data.responsable,
        fecha_inicio: data.fecha_inicio ?? null,
        fecha_limite: data.fecha_limite ?? null,
        estado: "pendiente",
        prioridad: data.prioridad ?? "media",
        notas: data.notas ?? null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: plan as PlanAccion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating plan" }
  }
}

export async function updatePlanAccion(
  id: string,
  data: {
    descripcion?: string
    responsable?: string
    fecha_inicio?: string
    fecha_limite?: string
    estado?: EstadoPlan
    prioridad?: PrioridadPlan
    notas?: string
  }
): Promise<{ data: PlanAccion } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { data: plan, error } = await supabase
      .from("planes_accion")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: plan as PlanAccion }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error updating plan" }
  }
}

export async function deletePlanAccion(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("planes_accion").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting plan" }
  }
}

// ---------- Evidencia CRUD ----------

export async function createEvidencia(data: {
  pregunta_id: string
  titulo: string
  descripcion?: string
  url?: string
  tipo: TipoEvidencia
}): Promise<{ data: Evidencia } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: evidencia, error } = await supabase
      .from("evidencias")
      .insert({
        pregunta_id: data.pregunta_id,
        titulo: data.titulo,
        descripcion: data.descripcion ?? null,
        url: data.url ?? null,
        tipo: data.tipo,
        created_by: profile.id,
      })
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: evidencia as Evidencia }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error creating evidencia" }
  }
}

export async function deleteEvidencia(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const { error } = await supabase.from("evidencias").delete().eq("id", id)
    if (error) return { error: error.message }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error deleting evidencia" }
  }
}

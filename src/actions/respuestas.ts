"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { calcPillarScore } from "@/lib/scoring"
import type { Bloque, Pregunta, Respuesta, Pilar } from "@/types/database"

interface PreguntaConRespuesta extends Pregunta {
  respuesta: { puntaje: number | null; comentario: string | null } | null
}

interface BloqueConPreguntas {
  id: string
  nombre: string
  orden: number
  preguntas: PreguntaConRespuesta[]
}

interface RespuestasPilarResult {
  bloques: BloqueConPreguntas[]
}

export async function getRespuestasPilar(
  auditoriaId: string,
  pilarId: string
): Promise<{ data: RespuestasPilarResult } | { error: string }> {
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

    // Get preguntas for these bloques
    const { data: preguntas, error: pregErr } = await supabase
      .from("preguntas")
      .select("*")
      .in("bloque_id", bloqueIds.length > 0 ? bloqueIds : ["__none__"])
      .order("numero")

    if (pregErr) return { error: pregErr.message }

    const preguntasArr = (preguntas ?? []) as Pregunta[]
    const preguntaIds = preguntasArr.map((p) => p.id)

    // Get respuestas for this audit and these preguntas
    const { data: respuestas, error: respErr } = await supabase
      .from("respuestas")
      .select("*")
      .eq("auditoria_id", auditoriaId)
      .in("pregunta_id", preguntaIds.length > 0 ? preguntaIds : ["__none__"])

    if (respErr) return { error: respErr.message }

    const respuestasArr = (respuestas ?? []) as Respuesta[]
    const respuestaByPregunta = new Map(
      respuestasArr.map((r) => [r.pregunta_id, r])
    )

    // Group preguntas by bloque
    const preguntasByBloque = new Map<string, PreguntaConRespuesta[]>()
    for (const p of preguntasArr) {
      const resp = respuestaByPregunta.get(p.id)
      const preguntaConResp: PreguntaConRespuesta = {
        ...p,
        respuesta: resp
          ? { puntaje: resp.puntaje, comentario: resp.comentario }
          : null,
      }
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(preguntaConResp)
      preguntasByBloque.set(p.bloque_id, list)
    }

    const result: BloqueConPreguntas[] = bloquesArr.map((b) => ({
      id: b.id,
      nombre: b.nombre,
      orden: b.orden,
      preguntas: preguntasByBloque.get(b.id) ?? [],
    }))

    return { data: { bloques: result } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading respuestas" }
  }
}

export async function saveRespuesta(data: {
  auditoriaId: string
  preguntaId: string
  puntaje: number
  comentario?: string
}): Promise<{ data: Respuesta } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const { data: respuesta, error } = await supabase
      .from("respuestas")
      .upsert(
        {
          auditoria_id: data.auditoriaId,
          pregunta_id: data.preguntaId,
          puntaje: data.puntaje,
          comentario: data.comentario ?? null,
          auditor_id: profile.id,
        },
        {
          onConflict: "auditoria_id,pregunta_id",
        }
      )
      .select()
      .single()

    if (error) return { error: error.message }
    return { data: respuesta as Respuesta }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error saving respuesta" }
  }
}

interface PilarProgressItem {
  pilarId: string
  pilarNombre: string
  color: string
  icono: string
  total: number
  answered: number
  score: number
}

export async function getPilarProgress(
  auditoriaId: string
): Promise<{ data: PilarProgressItem[] } | { error: string }> {
  try {
    const supabase = await createClient()

    const { data: pilares } = await supabase
      .from("pilares")
      .select("*")
      .order("orden")

    const { data: bloques } = await supabase
      .from("bloques")
      .select("id, pilar_id")

    const { data: preguntas } = await supabase
      .from("preguntas")
      .select("id, bloque_id, peso")

    const { data: respuestas } = await supabase
      .from("respuestas")
      .select("pregunta_id, puntaje")
      .eq("auditoria_id", auditoriaId)

    const pilaresArr = (pilares ?? []) as Pilar[]
    const bloquesArr = (bloques ?? []) as { id: string; pilar_id: string }[]
    const preguntasArr = (preguntas ?? []) as Pick<Pregunta, "id" | "bloque_id" | "peso">[]
    const respuestasArr = (respuestas ?? []) as Pick<Respuesta, "pregunta_id" | "puntaje">[]

    const bloquesByPilar = new Map<string, string[]>()
    for (const b of bloquesArr) {
      const list = bloquesByPilar.get(b.pilar_id) ?? []
      list.push(b.id)
      bloquesByPilar.set(b.pilar_id, list)
    }

    const preguntasByBloque = new Map<string, Pick<Pregunta, "id" | "bloque_id" | "peso">[]>()
    for (const p of preguntasArr) {
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(p)
      preguntasByBloque.set(p.bloque_id, list)
    }

    const respuestaMap = new Map(
      respuestasArr.map((r) => [r.pregunta_id, r])
    )

    const result: PilarProgressItem[] = pilaresArr.map((pilar) => {
      const bloqueIds = bloquesByPilar.get(pilar.id) ?? []
      const pilarPreguntas: Pick<Pregunta, "id" | "peso">[] = []
      for (const bid of bloqueIds) {
        pilarPreguntas.push(...(preguntasByBloque.get(bid) ?? []))
      }

      const pilarRespuestas = pilarPreguntas
        .map((p) => respuestaMap.get(p.id))
        .filter(
          (r): r is Pick<Respuesta, "pregunta_id" | "puntaje"> =>
            r !== undefined && r.puntaje !== null
        )

      const score = calcPillarScore(pilarRespuestas, pilarPreguntas)

      return {
        pilarId: pilar.id,
        pilarNombre: pilar.nombre,
        color: pilar.color,
        icono: pilar.icono,
        total: pilarPreguntas.length,
        answered: pilarRespuestas.length,
        score: Math.round(score * 100) / 100,
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading pilar progress" }
  }
}

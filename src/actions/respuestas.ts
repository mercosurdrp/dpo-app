"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { calcPillarScore } from "@/lib/scoring"
import {
  dimensionesDePilar,
  type DimensionAuditoria,
} from "@/lib/constants"
import type { Bloque, Pregunta, Respuesta, Pilar } from "@/types/database"

type RespuestaCelda = {
  puntaje: number | null
  noAplica: boolean
  comentario: string | null
}

interface PreguntaConRespuestas extends Pregunta {
  // una celda por dimensión activa del pilar (WH / DEL)
  respuestas: Partial<Record<DimensionAuditoria, RespuestaCelda>>
}

interface BloqueConPreguntas {
  id: string
  nombre: string
  orden: number
  preguntas: PreguntaConRespuestas[]
}

interface RespuestasPilarResult {
  dimensiones: DimensionAuditoria[]
  bloques: BloqueConPreguntas[]
}

export async function getRespuestasPilar(
  auditoriaId: string,
  pilarId: string
): Promise<{ data: RespuestasPilarResult } | { error: string }> {
  try {
    const supabase = await createClient()

    // Pilar (para saber qué dimensiones aplican)
    const { data: pilar, error: pilarErr } = await supabase
      .from("pilares")
      .select("nombre")
      .eq("id", pilarId)
      .single()

    if (pilarErr) return { error: pilarErr.message }
    const dimensiones = dimensionesDePilar((pilar as { nombre: string }).nombre)

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
    // key = `${pregunta_id}::${dimension}`
    const respByKey = new Map<string, Respuesta>(
      respuestasArr.map((r) => [`${r.pregunta_id}::${r.dimension}`, r])
    )

    // Group preguntas by bloque
    const preguntasByBloque = new Map<string, PreguntaConRespuestas[]>()
    for (const p of preguntasArr) {
      const respuestasCeldas: Partial<Record<DimensionAuditoria, RespuestaCelda>> = {}
      for (const dim of dimensiones) {
        const resp = respByKey.get(`${p.id}::${dim}`)
        if (resp) {
          respuestasCeldas[dim] = {
            puntaje: resp.puntaje,
            noAplica: resp.no_aplica,
            comentario: resp.comentario,
          }
        }
      }
      const preguntaConResp: PreguntaConRespuestas = {
        ...p,
        respuestas: respuestasCeldas,
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

    return { data: { dimensiones, bloques: result } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading respuestas" }
  }
}

export async function saveRespuesta(data: {
  auditoriaId: string
  preguntaId: string
  dimension: DimensionAuditoria
  // puntaje 0/1/3/5, o null cuando noAplica = true
  puntaje: number | null
  noAplica?: boolean
  comentario?: string
}): Promise<{ data: Respuesta } | { error: string }> {
  try {
    const profile = await requireAuth()
    const supabase = await createClient()

    const noAplica = data.noAplica ?? false

    const { data: respuesta, error } = await supabase
      .from("respuestas")
      .upsert(
        {
          auditoria_id: data.auditoriaId,
          pregunta_id: data.preguntaId,
          dimension: data.dimension,
          puntaje: noAplica ? null : data.puntaje,
          no_aplica: noAplica,
          comentario: data.comentario ?? null,
          auditor_id: profile.id,
        },
        {
          onConflict: "auditoria_id,pregunta_id,dimension",
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

interface PilarDimensionProgress {
  dimension: DimensionAuditoria
  total: number
  answered: number
  score: number
}

interface PilarProgressItem {
  pilarId: string
  pilarNombre: string
  color: string
  icono: string
  dimensiones: DimensionAuditoria[]
  porDimension: PilarDimensionProgress[]
  // agregados (para progreso/score general de la auditoría)
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
      .select("pregunta_id, dimension, puntaje, no_aplica")
      .eq("auditoria_id", auditoriaId)

    const pilaresArr = (pilares ?? []) as Pilar[]
    const bloquesArr = (bloques ?? []) as { id: string; pilar_id: string }[]
    const preguntasArr = (preguntas ?? []) as Pick<Pregunta, "id" | "bloque_id" | "peso">[]
    const respuestasArr = (respuestas ?? []) as Array<
      Pick<Respuesta, "pregunta_id" | "puntaje" | "dimension" | "no_aplica">
    >

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

    // respuestas por (pregunta_id, dimension)
    const respByKey = new Map<
      string,
      Pick<Respuesta, "pregunta_id" | "puntaje" | "dimension" | "no_aplica">
    >(respuestasArr.map((r) => [`${r.pregunta_id}::${r.dimension}`, r]))

    const result: PilarProgressItem[] = pilaresArr.map((pilar) => {
      const bloqueIds = bloquesByPilar.get(pilar.id) ?? []
      const pilarPreguntas: Pick<Pregunta, "id" | "peso">[] = []
      for (const bid of bloqueIds) {
        pilarPreguntas.push(...(preguntasByBloque.get(bid) ?? []))
      }

      const dimensiones = dimensionesDePilar(pilar.nombre)

      const porDimension: PilarDimensionProgress[] = dimensiones.map((dim) => {
        const celdas = pilarPreguntas
          .map((p) => respByKey.get(`${p.id}::${dim}`))
          .filter(
            (r): r is Pick<Respuesta, "pregunta_id" | "puntaje" | "dimension" | "no_aplica"> =>
              r !== undefined
          )

        // Para el score solo cuentan las que tienen puntaje (N/A se excluye).
        const conPuntaje = celdas.filter((r) => r.puntaje !== null)
        // "Respondidas" = con puntaje + las marcadas No aplica.
        const respondidas = celdas.filter((r) => r.puntaje !== null || r.no_aplica)
        // Las N/A no entran en el denominador del score.
        const aplicables = pilarPreguntas.filter(
          (p) => !respByKey.get(`${p.id}::${dim}`)?.no_aplica
        )

        const score = calcPillarScore(conPuntaje, aplicables)

        return {
          dimension: dim,
          total: pilarPreguntas.length,
          answered: respondidas.length,
          score: Math.round(score * 100) / 100,
        }
      })

      const total = porDimension.reduce((s, d) => s + d.total, 0)
      const answered = porDimension.reduce((s, d) => s + d.answered, 0)

      // Score del pilar = "DDC consolidado" del Excel: por cada punto, el promedio
      // de las dimensiones que aplican (puntaje no nulo y no N/A); ponderado por peso.
      // Si una dimensión es N/A, toma la otra; si ambas N/A, el punto se excluye.
      let consNum = 0
      let consDen = 0
      for (const p of pilarPreguntas) {
        const vals: number[] = []
        for (const dim of dimensiones) {
          const r = respByKey.get(`${p.id}::${dim}`)
          if (r && r.puntaje !== null && !r.no_aplica) vals.push(r.puntaje)
        }
        if (vals.length === 0) continue
        const qval = vals.reduce((a, b) => a + b, 0) / vals.length
        const peso = Number(p.peso)
        consNum += qval * peso
        consDen += 5 * peso
      }
      const score =
        consDen > 0 ? Math.round((consNum / consDen) * 100 * 100) / 100 : 0

      return {
        pilarId: pilar.id,
        pilarNombre: pilar.nombre,
        color: pilar.color,
        icono: pilar.icono,
        dimensiones,
        porDimension,
        total,
        answered,
        score,
      }
    })

    return { data: result }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading pilar progress" }
  }
}

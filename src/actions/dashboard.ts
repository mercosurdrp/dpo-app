"use server"

import { createClient } from "@/lib/supabase/server"
import { calcOverallScore } from "@/lib/scoring"
import { dimensionesDePilar, type DimensionAuditoria } from "@/lib/constants"
import type { Pilar, Pregunta, Respuesta, Auditoria } from "@/types/database"

type CeldaScore = { puntaje: number | null; no_aplica: boolean }

// Cierre consolidado tipo Excel: por cada punto, promedio de las dimensiones que
// aplican (puntaje no nulo y no N/A), ponderado por peso. Devuelve 0-100.
function consolidadoPilar(
  preguntas: Pick<Pregunta, "id" | "peso">[],
  dims: DimensionAuditoria[],
  respByKey: Map<string, CeldaScore>
): number {
  let num = 0
  let den = 0
  for (const p of preguntas) {
    const vals: number[] = []
    for (const d of dims) {
      const r = respByKey.get(`${p.id}::${d}`)
      if (r && r.puntaje !== null && !r.no_aplica) vals.push(r.puntaje)
    }
    if (vals.length === 0) continue
    const q = vals.reduce((a, b) => a + b, 0) / vals.length
    const peso = Number(p.peso)
    num += q * peso
    den += 5 * peso
  }
  return den > 0 ? (num / den) * 100 : 0
}

// Cantidad de PUNTOS respondidos (con puntaje en alguna dimensión, o N/A).
function respondidasPilar(
  preguntas: Pick<Pregunta, "id">[],
  dims: DimensionAuditoria[],
  respByKey: Map<string, CeldaScore>
): number {
  let n = 0
  for (const p of preguntas) {
    for (const d of dims) {
      const r = respByKey.get(`${p.id}::${d}`)
      if (r && (r.puntaje !== null || r.no_aplica)) {
        n++
        break
      }
    }
  }
  return n
}

interface PillarScoreResult {
  pilarId: string
  pilarNombre: string
  color: string
  icono: string
  score: number
  answered: number
  total: number
  mandatoryScore: number
}

interface AuditoriaHistoryItem {
  id: string
  nombre: string
  fecha: string
  overallScore: number
}

interface DashboardData {
  auditoria: Auditoria | null
  pillarScores: PillarScoreResult[]
  overallScore: number
  pendingActions: number
  totalPreguntas: number
  totalRespondidas: number
  auditoriasHistory: AuditoriaHistoryItem[]
}

export async function getDashboardData(
  auditoriaId?: string
): Promise<DashboardData | { error: string }> {
  try {
    const supabase = await createClient()

    // Get the target auditoria
    let auditoria: Auditoria | null = null

    if (auditoriaId) {
      const { data, error } = await supabase
        .from("auditorias")
        .select("*")
        .eq("id", auditoriaId)
        .single()
      if (error) return { error: error.message }
      auditoria = data as Auditoria
    } else {
      const { data } = await supabase
        .from("auditorias")
        .select("*")
        .order("fecha_inicio", { ascending: false })
        .limit(1)
        .single()
      auditoria = (data as Auditoria) ?? null
    }

    if (!auditoria) {
      return {
        auditoria: null,
        pillarScores: [],
        overallScore: 0,
        pendingActions: 0,
        totalPreguntas: 0,
        totalRespondidas: 0,
        auditoriasHistory: [],
      }
    }

    // Get all pilares
    const { data: pilares } = await supabase
      .from("pilares")
      .select("*")
      .order("orden")

    // Get all bloques
    const { data: bloques } = await supabase
      .from("bloques")
      .select("*")

    // Get all preguntas
    const { data: preguntas } = await supabase
      .from("preguntas")
      .select("*")

    // Get respuestas for this auditoria
    const { data: respuestas } = await supabase
      .from("respuestas")
      .select("*")
      .eq("auditoria_id", auditoria.id)

    // Get pending actions count
    const { count: pendingActions } = await supabase
      .from("acciones")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente")
      .in(
        "respuesta_id",
        (respuestas ?? []).map((r: Respuesta) => r.id)
      )

    const pilaresArr = (pilares ?? []) as Pilar[]
    const bloquesArr = (bloques ?? []) as { id: string; pilar_id: string }[]
    const preguntasArr = (preguntas ?? []) as Pregunta[]
    const respuestasArr = (respuestas ?? []) as Respuesta[]

    // Build pilar -> bloques -> preguntas mapping
    const bloquesByPilar = new Map<string, string[]>()
    for (const b of bloquesArr) {
      const list = bloquesByPilar.get(b.pilar_id) ?? []
      list.push(b.id)
      bloquesByPilar.set(b.pilar_id, list)
    }

    const preguntasByBloque = new Map<string, Pregunta[]>()
    for (const p of preguntasArr) {
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(p)
      preguntasByBloque.set(p.bloque_id, list)
    }

    // Respuestas por (pregunta_id, dimension) para el consolidado WH/Entrega.
    const respByKey = new Map<string, CeldaScore>()
    for (const r of respuestasArr) {
      respByKey.set(`${r.pregunta_id}::${r.dimension}`, {
        puntaje: r.puntaje,
        no_aplica: r.no_aplica,
      })
    }

    // Calculate pillar scores
    const pillarScores: PillarScoreResult[] = []
    const pillarScoreValues: number[] = []

    for (const pilar of pilaresArr) {
      const bloqueIds = bloquesByPilar.get(pilar.id) ?? []
      const pilarPreguntas: Pregunta[] = []
      for (const bid of bloqueIds) {
        pilarPreguntas.push(...(preguntasByBloque.get(bid) ?? []))
      }

      const dims = dimensionesDePilar(pilar.nombre)
      const score = consolidadoPilar(pilarPreguntas, dims, respByKey)

      // Mandatory score: solo preguntas obligatorias
      const mandatoryScore = consolidadoPilar(
        pilarPreguntas.filter((p) => p.mandatorio),
        dims,
        respByKey
      )

      pillarScores.push({
        pilarId: pilar.id,
        pilarNombre: pilar.nombre,
        color: pilar.color,
        icono: pilar.icono,
        score: Math.round(score * 100) / 100,
        answered: respondidasPilar(pilarPreguntas, dims, respByKey),
        total: pilarPreguntas.length,
        mandatoryScore: Math.round(mandatoryScore * 100) / 100,
      })

      pillarScoreValues.push(score)
    }

    const overallScore = Math.round(calcOverallScore(pillarScoreValues) * 100) / 100

    // Auditorias history for trend chart
    const { data: allAuditorias } = await supabase
      .from("auditorias")
      .select("*")
      .order("fecha_inicio", { ascending: true })

    const auditoriasHistory: AuditoriaHistoryItem[] = []

    for (const aud of (allAuditorias ?? []) as Auditoria[]) {
      const { data: audResp } = await supabase
        .from("respuestas")
        .select("pregunta_id, puntaje, dimension, no_aplica")
        .eq("auditoria_id", aud.id)

      const audRespArr = (audResp ?? []) as Pick<
        Respuesta,
        "pregunta_id" | "puntaje" | "dimension" | "no_aplica"
      >[]
      const audByKey = new Map<string, CeldaScore>()
      for (const r of audRespArr) {
        audByKey.set(`${r.pregunta_id}::${r.dimension}`, {
          puntaje: r.puntaje,
          no_aplica: r.no_aplica,
        })
      }
      const audPillarScores: number[] = []

      for (const pilar of pilaresArr) {
        const bloqueIds = bloquesByPilar.get(pilar.id) ?? []
        const pilarPreguntas: Pregunta[] = []
        for (const bid of bloqueIds) {
          pilarPreguntas.push(...(preguntasByBloque.get(bid) ?? []))
        }
        audPillarScores.push(
          consolidadoPilar(pilarPreguntas, dimensionesDePilar(pilar.nombre), audByKey)
        )
      }

      auditoriasHistory.push({
        id: aud.id,
        nombre: aud.nombre,
        fecha: aud.fecha_inicio,
        overallScore: Math.round(calcOverallScore(audPillarScores) * 100) / 100,
      })
    }

    return {
      auditoria,
      pillarScores,
      overallScore,
      pendingActions: pendingActions ?? 0,
      totalPreguntas: pillarScores.reduce((s, p) => s + p.total, 0),
      totalRespondidas: pillarScores.reduce((s, p) => s + p.answered, 0),
      auditoriasHistory,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading dashboard data" }
  }
}

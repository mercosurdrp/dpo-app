"use server"

import { createClient } from "@/lib/supabase/server"
import { calcPillarScore, calcOverallScore } from "@/lib/scoring"
import type { Pilar, Pregunta, Respuesta, Auditoria } from "@/types/database"

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

    const respuestaByPregunta = new Map<string, Respuesta>()
    for (const r of respuestasArr) {
      respuestaByPregunta.set(r.pregunta_id, r)
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

      const pilarRespuestas = pilarPreguntas
        .map((p) => respuestaByPregunta.get(p.id))
        .filter((r): r is Respuesta => r !== undefined && r.puntaje !== null)

      const score = calcPillarScore(pilarRespuestas, pilarPreguntas)

      // Mandatory score: only mandatory questions
      const mandatoryPreguntas = pilarPreguntas.filter((p) => p.mandatorio)
      const mandatoryRespuestas = mandatoryPreguntas
        .map((p) => respuestaByPregunta.get(p.id))
        .filter((r): r is Respuesta => r !== undefined && r.puntaje !== null)
      const mandatoryScore = calcPillarScore(mandatoryRespuestas, mandatoryPreguntas)

      pillarScores.push({
        pilarId: pilar.id,
        pilarNombre: pilar.nombre,
        color: pilar.color,
        icono: pilar.icono,
        score: Math.round(score * 100) / 100,
        answered: pilarRespuestas.length,
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
        .select("pregunta_id, puntaje")
        .eq("auditoria_id", aud.id)

      const audRespArr = (audResp ?? []) as Pick<Respuesta, "pregunta_id" | "puntaje">[]
      const audPillarScores: number[] = []

      for (const pilar of pilaresArr) {
        const bloqueIds = bloquesByPilar.get(pilar.id) ?? []
        const pilarPreguntas: Pregunta[] = []
        for (const bid of bloqueIds) {
          pilarPreguntas.push(...(preguntasByBloque.get(bid) ?? []))
        }
        const pilarResp = audRespArr.filter(
          (r) => pilarPreguntas.some((p) => p.id === r.pregunta_id) && r.puntaje !== null
        )
        audPillarScores.push(calcPillarScore(pilarResp, pilarPreguntas))
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
      totalPreguntas: preguntasArr.length,
      totalRespondidas: respuestasArr.filter((r) => r.puntaje !== null).length,
      auditoriasHistory,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error loading dashboard data" }
  }
}

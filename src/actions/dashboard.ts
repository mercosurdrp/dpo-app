"use server"

import { createClient } from "@/lib/supabase/server"
import { calcPillarScore, calcOverallScore } from "@/lib/scoring"
import type { Pilar, Pregunta, Respuesta, Auditoria } from "@/types/database"

/** Lo único que el scoring necesita de cada pregunta / respuesta. */
type PreguntaScore = Pick<Pregunta, "id" | "bloque_id" | "mandatorio" | "peso">
type RespuestaScore = Pick<Respuesta, "id" | "pregunta_id" | "puntaje">

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

    // Catálogo y auditorías: nada de esto depende de lo otro, así que va todo
    // en paralelo. Antes eran seis SELECT en fila contra una base que está en
    // otra región, y cada uno pagaba su propio round-trip.
    //
    // Los `select("*")` de preguntas y respuestas se reemplazaron por las
    // columnas que el scoring realmente usa: traían texto, guia, requerimiento
    // y el JSON de puntaje_criterio de las 167 preguntas para leer sólo `peso`.
    const [audRes, pilaresRes, bloquesRes, preguntasRes, allAuditoriasRes] =
      await Promise.all([
        auditoriaId
          ? supabase.from("auditorias").select("*").eq("id", auditoriaId).single()
          : supabase
              .from("auditorias")
              .select("*")
              .order("fecha_inicio", { ascending: false })
              .limit(1)
              .maybeSingle(),
        supabase.from("pilares").select("*").order("orden"),
        supabase.from("bloques").select("id, pilar_id"),
        supabase.from("preguntas").select("id, bloque_id, mandatorio, peso"),
        supabase
          .from("auditorias")
          .select("id, nombre, fecha_inicio")
          .order("fecha_inicio", { ascending: true }),
      ])

    if (auditoriaId && audRes.error) return { error: audRes.error.message }
    const auditoria = (audRes.data as Auditoria) ?? null

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

    const pilaresArr = (pilaresRes.data ?? []) as Pilar[]
    const bloquesArr = (bloquesRes.data ?? []) as { id: string; pilar_id: string }[]
    const preguntasArr = (preguntasRes.data ?? []) as Pick<
      Pregunta,
      "id" | "bloque_id" | "mandatorio" | "peso"
    >[]
    const allAuditorias = (allAuditoriasRes.data ?? []) as Pick<
      Auditoria,
      "id" | "nombre" | "fecha_inicio"
    >[]

    // Respuestas de TODAS las auditorías de una, agrupadas después en memoria.
    // Antes: un SELECT para la auditoría activa y, más abajo, otro SELECT por
    // cada auditoría del historial dentro de un `for` — un round-trip por fila.
    const respuestasPorAuditoria = new Map<
      string,
      Pick<Respuesta, "id" | "pregunta_id" | "puntaje">[]
    >()
    for (const aud of allAuditorias) respuestasPorAuditoria.set(aud.id, [])
    if (!respuestasPorAuditoria.has(auditoria.id)) {
      respuestasPorAuditoria.set(auditoria.id, [])
    }

    // PostgREST corta en 1000 filas por request: se pagina para que el
    // historial no quede truncado cuando se acumulen varias auditorías.
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("respuestas")
        .select("id, auditoria_id, pregunta_id, puntaje")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      for (const r of data as (Respuesta & { auditoria_id: string })[]) {
        const lista = respuestasPorAuditoria.get(r.auditoria_id)
        if (lista) lista.push({ id: r.id, pregunta_id: r.pregunta_id, puntaje: r.puntaje })
      }
      if (data.length < PAGE) break
    }

    const respuestasArr = respuestasPorAuditoria.get(auditoria.id) ?? []

    // Acciones pendientes de esta auditoría. Antes se mandaban los ~167 UUID
    // de las respuestas dentro de un `.in()`, o sea una URL de varios KB en un
    // GET; ahora se traen las pendientes (que son pocas) y se cruzan acá.
    const idsRespuestas = new Set(respuestasArr.map((r) => r.id))
    const { data: accionesPendientes } = await supabase
      .from("acciones")
      .select("respuesta_id")
      .eq("estado", "pendiente")
    const pendingActions = (accionesPendientes ?? []).filter(
      (a: { respuesta_id: string }) => idsRespuestas.has(a.respuesta_id)
    ).length

    // Build pilar -> bloques -> preguntas mapping
    const bloquesByPilar = new Map<string, string[]>()
    for (const b of bloquesArr) {
      const list = bloquesByPilar.get(b.pilar_id) ?? []
      list.push(b.id)
      bloquesByPilar.set(b.pilar_id, list)
    }

    const preguntasByBloque = new Map<string, PreguntaScore[]>()
    for (const p of preguntasArr) {
      const list = preguntasByBloque.get(p.bloque_id) ?? []
      list.push(p)
      preguntasByBloque.set(p.bloque_id, list)
    }

    // Las preguntas de cada pilar se arman UNA vez y se reusan para la
    // auditoría activa y para todo el historial. Antes se rearmaban dentro del
    // loop de auditorías, y encima se cruzaban con un `.some()` adentro de un
    // `.filter()`: O(preguntas × respuestas) por pilar y por auditoría.
    const preguntasPorPilar = new Map<string, PreguntaScore[]>()
    const pilarDePregunta = new Map<string, string>()
    for (const pilar of pilaresArr) {
      const lista: PreguntaScore[] = []
      for (const bid of bloquesByPilar.get(pilar.id) ?? []) {
        for (const p of preguntasByBloque.get(bid) ?? []) {
          lista.push(p)
          pilarDePregunta.set(p.id, pilar.id)
        }
      }
      preguntasPorPilar.set(pilar.id, lista)
    }

    const respuestaByPregunta = new Map<string, RespuestaScore>()
    for (const r of respuestasArr) {
      respuestaByPregunta.set(r.pregunta_id, r)
    }

    // Calculate pillar scores
    const pillarScores: PillarScoreResult[] = []
    const pillarScoreValues: number[] = []

    for (const pilar of pilaresArr) {
      const pilarPreguntas = preguntasPorPilar.get(pilar.id) ?? []

      const pilarRespuestas = pilarPreguntas
        .map((p) => respuestaByPregunta.get(p.id))
        .filter((r): r is RespuestaScore => r !== undefined && r.puntaje !== null)

      const score = calcPillarScore(pilarRespuestas, pilarPreguntas)

      // Mandatory score: only mandatory questions
      const mandatoryPreguntas = pilarPreguntas.filter((p) => p.mandatorio)
      const mandatoryRespuestas = mandatoryPreguntas
        .map((p) => respuestaByPregunta.get(p.id))
        .filter((r): r is RespuestaScore => r !== undefined && r.puntaje !== null)
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

    // Auditorias history for trend chart. Las respuestas ya están todas en
    // memoria (ver `respuestasPorAuditoria`), así que acá no se consulta nada:
    // antes era un SELECT por auditoría, en fila.
    const auditoriasHistory: AuditoriaHistoryItem[] = []

    for (const aud of allAuditorias) {
      const audRespArr = respuestasPorAuditoria.get(aud.id) ?? []

      // Agrupar las respuestas por pilar en una sola pasada, resolviendo el
      // pilar con el índice `pilarDePregunta` en vez de recorrer las preguntas.
      const respPorPilar = new Map<string, RespuestaScore[]>()
      for (const r of audRespArr) {
        if (r.puntaje === null) continue
        const pilarId = pilarDePregunta.get(r.pregunta_id)
        if (!pilarId) continue
        const lista = respPorPilar.get(pilarId) ?? []
        lista.push(r)
        respPorPilar.set(pilarId, lista)
      }

      const audPillarScores = pilaresArr.map((pilar) =>
        calcPillarScore(
          respPorPilar.get(pilar.id) ?? [],
          preguntasPorPilar.get(pilar.id) ?? []
        )
      )

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

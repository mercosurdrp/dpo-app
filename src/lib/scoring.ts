import type { Respuesta, Pregunta } from "@/types/database"

const MAX_SCORE = 5

/**
 * Calculate a pillar score as weighted average normalized to 0-100.
 * Only considers questions that have a response (puntaje !== null).
 */
export function calcPillarScore(
  respuestas: Pick<Respuesta, "pregunta_id" | "puntaje">[],
  preguntas: Pick<Pregunta, "id" | "peso">[]
): number {
  const preguntaMap = new Map(preguntas.map((p) => [p.id, p]))

  let weightedSum = 0
  let totalWeight = 0

  for (const r of respuestas) {
    if (r.puntaje === null) continue
    const pregunta = preguntaMap.get(r.pregunta_id)
    if (!pregunta) continue

    const peso = Number(pregunta.peso)
    weightedSum += r.puntaje * peso
    totalWeight += MAX_SCORE * peso
  }

  if (totalWeight === 0) return 0
  return (weightedSum / totalWeight) * 100
}

/**
 * Calculate overall score as average of pillar scores.
 */
export function calcOverallScore(pillarScores: number[]): number {
  if (pillarScores.length === 0) return 0
  const sum = pillarScores.reduce((acc, s) => acc + s, 0)
  return sum / pillarScores.length
}

/**
 * Get traffic light color category based on score (0-100).
 */
export function getTrafficLight(score: number): "green" | "yellow" | "red" {
  if (score >= 60) return "green"
  if (score >= 40) return "yellow"
  return "red"
}

/**
 * Get hex color based on traffic light threshold.
 */
export function getScoreColor(score: number): string {
  const light = getTrafficLight(score)
  switch (light) {
    case "green":
      return "#10B981"
    case "yellow":
      return "#F59E0B"
    case "red":
      return "#EF4444"
  }
}

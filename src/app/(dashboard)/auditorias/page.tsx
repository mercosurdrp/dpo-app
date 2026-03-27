import { getAuditorias } from "@/actions/auditorias"
import { getPilarProgress } from "@/actions/respuestas"
import { AuditoriasClient } from "./auditorias-client"

export default async function AuditoriasPage() {
  const result = await getAuditorias()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditorias</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  // Fetch progress for each auditoria to get total answered + score
  const auditoriasWithProgress = await Promise.all(
    result.data.map(async (auditoria) => {
      const progressResult = await getPilarProgress(auditoria.id)
      if ("error" in progressResult) {
        return { auditoria, totalAnswered: 0, totalQuestions: 0, overallScore: 0 }
      }
      const pilars = progressResult.data
      const totalQuestions = pilars.reduce((sum, p) => sum + p.total, 0)
      const totalAnswered = pilars.reduce((sum, p) => sum + p.answered, 0)
      const scores = pilars.filter((p) => p.answered > 0).map((p) => p.score)
      const overallScore =
        scores.length > 0
          ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
          : 0
      return { auditoria, totalAnswered, totalQuestions, overallScore }
    })
  )

  return <AuditoriasClient auditorias={auditoriasWithProgress} />
}

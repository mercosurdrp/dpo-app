import { getAuditoria } from "@/actions/auditorias"
import { getPilarProgress } from "@/actions/respuestas"
import { AuditDetailClient } from "./audit-detail-client"

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [auditoriaResult, progressResult] = await Promise.all([
    getAuditoria(id),
    getPilarProgress(id),
  ])

  if ("error" in auditoriaResult) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoria</h1>
        <p className="mt-2 text-red-500">Error: {auditoriaResult.error}</p>
      </div>
    )
  }

  const pilarProgress =
    "error" in progressResult ? [] : progressResult.data

  return (
    <AuditDetailClient
      auditoria={auditoriaResult.data}
      pilarProgress={pilarProgress}
    />
  )
}

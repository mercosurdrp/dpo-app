import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getFoxtrotKpis, getFoxtrotRoutes, getFoxtrotSyncLogs } from "@/actions/foxtrot"
import { FoxtrotTrackingClient } from "./foxtrot-tracking-client"

export default async function FoxtrotTrackingPage() {
  const [kpisRes, rutasRes, logsRes] = await Promise.all([
    getFoxtrotKpis(),
    getFoxtrotRoutes({ limit: 50 }),
    getFoxtrotSyncLogs(10),
  ])
  const kpis = "data" in kpisRes ? kpisRes.data : null
  const kpisError = "error" in kpisRes ? kpisRes.error : null
  const rutas = "data" in rutasRes ? rutasRes.data : []
  const logs = "data" in logsRes ? logsRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <FoxtrotTrackingClient
        kpis={kpis}
        kpisError={kpisError}
        rutas={rutas}
        logs={logs}
      />
    </div>
  )
}

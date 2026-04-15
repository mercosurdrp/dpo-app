import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getFoxtrotDashboard } from "@/actions/foxtrot"
import { FoxtrotDashboardClient } from "./foxtrot-dashboard-client"

export default async function FoxtrotTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  const params = await searchParams
  const fecha = params.fecha ?? new Date().toISOString().slice(0, 10)
  const res = await getFoxtrotDashboard(fecha)
  const data = "data" in res ? res.data : null
  const error = "error" in res ? res.error : null

  return (
    <div className="space-y-3">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <FoxtrotDashboardClient data={data} error={error} fecha={fecha} />
    </div>
  )
}

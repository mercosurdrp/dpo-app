import { getTiKpis, getTiPlanesResumen } from "@/actions/tiempo-interno"
import { TiempoInternoClient } from "./tiempo-interno-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function TiempoInternoPage() {
  const [kpisRes, planesRes] = await Promise.all([
    getTiKpis(),
    getTiPlanesResumen(),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tiempo Interno</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const planesResumen = "data" in planesRes ? planesRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <TiempoInternoClient kpis={kpisRes.data} planesResumen={planesResumen} />
    </div>
  )
}

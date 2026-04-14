import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getOwdKpis, getObservaciones } from "@/actions/owd-pre-ruta"
import { OwdClient } from "./owd-client"

export default async function OwdPreRutaPage() {
  const [kpisRes, obsRes] = await Promise.all([
    getOwdKpis(),
    getObservaciones({ limit: 50 }),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">OWD Pre-Ruta</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const observaciones = "data" in obsRes ? obsRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <OwdClient kpis={kpisRes.data} observaciones={observaciones} />
    </div>
  )
}

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getSciData } from "@/actions/sci"
import { SciClient } from "./sci-client"

export const dynamic = "force-dynamic"

export default async function SciPage() {
  const res = await getSciData()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SCI — Índice de Curva de Ventas</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <SciClient inicial={res.data} />
    </div>
  )
}

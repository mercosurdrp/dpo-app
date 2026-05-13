import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { IS_MISIONES } from "@/lib/empresa"
import { requireAuth } from "@/lib/session"
import { getObjetivosTiempoRutaZona } from "@/actions/tiempo-ruta-zona"
import { ObjetivosTiempoRutaEditor } from "./objetivos-client"

export const dynamic = "force-dynamic"

export default async function ObjetivosTiempoRutaPage() {
  if (!IS_MISIONES) redirect("/indicadores/tiempo-ruta")
  const profile = await requireAuth()
  if (profile.role !== "admin") redirect("/indicadores/tiempo-ruta-foxtrot")

  const res = await getObjetivosTiempoRutaZona()
  if ("error" in res) {
    return (
      <div className="space-y-4">
        <Link
          href="/indicadores/tiempo-ruta-foxtrot"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al tablero
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Objetivos por zona</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <Link
        href="/indicadores/tiempo-ruta-foxtrot"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al tablero
      </Link>
      <ObjetivosTiempoRutaEditor initial={res.data} />
    </div>
  )
}

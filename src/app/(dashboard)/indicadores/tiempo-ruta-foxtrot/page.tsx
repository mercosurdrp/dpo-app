import Link from "next/link"
import { ArrowLeft, Settings2 } from "lucide-react"
import { redirect } from "next/navigation"
import { IS_MISIONES } from "@/lib/empresa"
import { requireAuth } from "@/lib/session"
import { getObjetivosTiempoRutaZona } from "@/actions/tiempo-ruta-zona"
import { TiempoRutaFoxtrotClient } from "./tiempo-ruta-foxtrot-client"

export const dynamic = "force-dynamic"

export default async function TiempoRutaFoxtrotPage() {
  if (!IS_MISIONES) redirect("/indicadores/tiempo-ruta")
  const profile = await requireAuth()
  const objRes = await getObjetivosTiempoRutaZona()

  if ("error" in objRes) {
    return (
      <div className="space-y-4">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Tiempo en Ruta — Foxtrot</h1>
        <p className="mt-2 text-red-500">Error: {objRes.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        {profile.role === "admin" && (
          <Link
            href="/indicadores/tiempo-ruta-foxtrot/objetivos"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-3.5 w-3.5" /> Configurar objetivos por zona
          </Link>
        )}
      </div>
      <TiempoRutaFoxtrotClient objetivos={objRes.data} />
    </div>
  )
}

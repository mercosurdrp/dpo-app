import { getPuntualidadRango } from "@/actions/puntualidad"
import { PuntualidadClient } from "./puntualidad-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

// "Hoy" en hora Argentina (el server corre en UTC).
function hoyAr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export default async function PuntualidadPage() {
  const hoy = hoyAr()
  // Período por defecto: mes en curso (día 1 → hoy).
  const desde = `${hoy.slice(0, 8)}01`

  const res = await getPuntualidadRango(desde, hoy, "mes")

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">% Puntualidad Pre-Ruta</h1>
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
      <PuntualidadClient initial={res.data} hoy={hoy} />
    </div>
  )
}

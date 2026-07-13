import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { TiempoRutaFlotaClient } from "./tiempo-ruta-flota-client"

export const dynamic = "force-dynamic"

export default async function TiempoRutaFlotaPage() {
  await requireAuth()

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores/flota"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Flota
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tiempo promedio en ruta</h1>
        <p className="text-sm text-muted-foreground">
          Duración real de la salida medida por Foxtrot (cierre − arranque), solo rutas cerradas en
          el día.
        </p>
      </div>
      <TiempoRutaFlotaClient anio={new Date().getFullYear()} />
    </div>
  )
}

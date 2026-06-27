import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { IS_MISIONES } from "@/lib/empresa"
import { MantenimientoFlotaClient } from "./mantenimiento-client"

export default function MantenimientoFlotaPage() {
  if (!IS_MISIONES) {
    return (
      <div>
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">No disponible</h1>
        <p className="mt-2 text-muted-foreground">
          El mantenimiento de flota está disponible sólo en Misiones.
        </p>
      </div>
    )
  }

  return <MantenimientoFlotaClient />
}

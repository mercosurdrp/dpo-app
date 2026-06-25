import { getVehiculos, getChoferes } from "@/actions/registros-vehiculos"
import { CombustibleFormClient } from "./combustible-form-client"
import Link from "next/link"
import { ArrowLeft, BarChart3 } from "lucide-react"

export default async function CombustiblePage() {
  const [vehiculosRes, choferesRes] = await Promise.all([
    getVehiculos(),
    getChoferes(),
  ])

  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []
  const choferes = "data" in choferesRes ? choferesRes.data : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/vehiculos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Vehículos
        </Link>
        <Link
          href="/vehiculos/combustible/analisis"
          className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-100"
        >
          <BarChart3 className="h-4 w-4" /> Ver análisis del mes
        </Link>
      </div>
      <CombustibleFormClient
        vehiculos={vehiculos}
        choferes={choferes}
      />
    </div>
  )
}

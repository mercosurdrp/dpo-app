import { getVehiculos, getChoferes } from "@/actions/registros-vehiculos"
import { CombustibleFormClient } from "./combustible-form-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function CombustiblePage() {
  const [vehiculosRes, choferesRes] = await Promise.all([
    getVehiculos(),
    getChoferes(),
  ])

  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []
  const choferes = "data" in choferesRes ? choferesRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/vehiculos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Vehículos
      </Link>
      <CombustibleFormClient
        vehiculos={vehiculos}
        choferes={choferes}
      />
    </div>
  )
}

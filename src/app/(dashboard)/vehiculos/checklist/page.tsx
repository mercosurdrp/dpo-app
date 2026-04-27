import { getChecklistItems } from "@/actions/checklist-vehiculos"
import { getVehiculos, getChoferes } from "@/actions/registros-vehiculos"
import { ChecklistFormClient } from "./checklist-form-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function ChecklistPage() {
  const [itemsRes, vehiculosRes, choferesRes] = await Promise.all([
    getChecklistItems(),
    getVehiculos(),
    getChoferes(),
  ])

  if ("error" in itemsRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Checklist Vehículo</h1>
        <p className="mt-2 text-red-500">Error: {itemsRes.error}</p>
      </div>
    )
  }

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
      <ChecklistFormClient
        items={itemsRes.data}
        vehiculos={vehiculos}
        choferes={choferes}
      />
    </div>
  )
}

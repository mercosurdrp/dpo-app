import {
  getChecklistItems,
  getChecklistsDeFecha,
  getUltimasLecturasFlota,
} from "@/actions/checklist-vehiculos"
import { getVehiculos, getChoferes } from "@/actions/registros-vehiculos"
import { ChecklistFormClient } from "./checklist-form-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function ChecklistPage() {
  // Misma fecha con la que el form graba el checklist, para que el aviso de
  // "ya está hecho" mire exactamente las filas contra las que valida el server.
  const hoy = new Date().toISOString().slice(0, 10)
  const [itemsRes, vehiculosRes, choferesRes, ultimasLecturas, checklistsHoy] =
    await Promise.all([
      getChecklistItems(),
      getVehiculos(),
      getChoferes(),
      getUltimasLecturasFlota(),
      getChecklistsDeFecha(hoy),
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
        ultimasLecturas={ultimasLecturas}
        checklistsHoy={checklistsHoy}
      />
    </div>
  )
}

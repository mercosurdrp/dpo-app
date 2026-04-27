import { getTiempoRutaKpis, getChecklists } from "@/actions/checklist-vehiculos"
import { getVehiculos } from "@/actions/registros-vehiculos"
import { TiempoRutaClient } from "./tiempo-ruta-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function TiempoRutaPage() {
  const [kpisRes, checklistsRes, vehiculosRes] = await Promise.all([
    getTiempoRutaKpis(),
    getChecklists({ tipo: "retorno", limit: 50 }),
    getVehiculos(),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tiempo en Ruta</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const checklists = "data" in checklistsRes ? checklistsRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <TiempoRutaClient
        kpis={kpisRes.data}
        checklists={checklists}
        vehiculos={vehiculos}
      />
    </div>
  )
}

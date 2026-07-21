import { getTiempoRutaKpis, getChecklists } from "@/actions/checklist-vehiculos"
import { getVehiculos } from "@/actions/registros-vehiculos"
import { getTiempoRutaClientes } from "@/actions/tiempo-ruta-cliente"
import { TiempoRutaClient } from "./tiempo-ruta-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function TiempoRutaPage() {
  // El detalle por PDV se mira sobre el año corrido: con menos historia la mediana
  // por cliente queda armada con 4-5 visitas y no aguanta una discusión.
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = `${hoy.slice(0, 4)}-01-01`

  const [kpisRes, checklistsRes, vehiculosRes, clientesRes] = await Promise.all([
    getTiempoRutaKpis(),
    getChecklists({ tipo: "retorno", limit: 50 }),
    getVehiculos(),
    getTiempoRutaClientes(desde, hoy),
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
        clientes={"data" in clientesRes ? clientesRes.data : null}
      />
    </div>
  )
}

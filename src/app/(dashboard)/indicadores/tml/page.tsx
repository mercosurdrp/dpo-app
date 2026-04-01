import { getTmlKpis, getRegistrosVehiculos, getChoferes, getVehiculos } from "@/actions/registros-vehiculos"
import { TmlClient } from "./tml-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function TmlPage() {
  const [kpisRes, registrosRes, choferesRes, vehiculosRes] = await Promise.all([
    getTmlKpis(),
    getRegistrosVehiculos({ tipo: "egreso", limit: 50 }),
    getChoferes(),
    getVehiculos(),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores TML</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const registros = "data" in registrosRes ? registrosRes.data : []
  const choferes = "data" in choferesRes ? choferesRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <TmlClient
        kpis={kpisRes.data}
        registros={registros}
        choferes={choferes}
        vehiculos={vehiculos}
      />
    </div>
  )
}

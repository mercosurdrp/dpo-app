import { getTmlKpis, getRegistrosVehiculos, getChoferes, getVehiculos } from "@/actions/registros-vehiculos"
import { IndicadoresClient } from "./indicadores-client"

export default async function IndicadoresPage() {
  const [kpisRes, registrosRes, choferesRes, vehiculosRes] = await Promise.all([
    getTmlKpis(),
    getRegistrosVehiculos({ tipo: "egreso", limit: 50 }),
    getChoferes(),
    getVehiculos(),
  ])

  if ("error" in kpisRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores</h1>
        <p className="mt-2 text-red-500">Error: {kpisRes.error}</p>
      </div>
    )
  }

  const registros = "data" in registrosRes ? registrosRes.data : []
  const choferes = "data" in choferesRes ? choferesRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []

  return (
    <IndicadoresClient
      kpis={kpisRes.data}
      registros={registros}
      choferes={choferes}
      vehiculos={vehiculos}
    />
  )
}

import { getEstadoVehiculosHoy, getChecklists } from "@/actions/checklist-vehiculos"
import { getRegistrosCombustible } from "@/actions/combustible"
import { getVehiculos, getChoferes } from "@/actions/registros-vehiculos"
import { getKmFlotaResumen, getAlertasVehiculos } from "@/actions/vehiculos-analytics"
import { getMaestroFlota } from "@/actions/maestro-flota"
import { VehiculosClient } from "./vehiculos-client"

export default async function VehiculosPage() {
  const [
    estadoRes,
    checklistsRes,
    combustibleRes,
    vehiculosRes,
    choferesRes,
    kmResumenRes,
    alertasRes,
    maestroRes,
  ] = await Promise.all([
    getEstadoVehiculosHoy(),
    getChecklists({ limit: 50 }),
    getRegistrosCombustible({ limit: 50 }),
    getVehiculos(),
    getChoferes(),
    getKmFlotaResumen(),
    getAlertasVehiculos(),
    getMaestroFlota(),
  ])

  if ("error" in estadoRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Vehículos</h1>
        <p className="mt-2 text-red-500">Error: {estadoRes.error}</p>
      </div>
    )
  }

  const checklists = "data" in checklistsRes ? checklistsRes.data : []
  const combustible = "data" in combustibleRes ? combustibleRes.data : []
  const vehiculos = "data" in vehiculosRes ? vehiculosRes.data : []
  const choferes = "data" in choferesRes ? choferesRes.data : []
  const kmFlotaResumen = "data" in kmResumenRes ? kmResumenRes.data : null
  const alertas = "data" in alertasRes ? alertasRes.data : []
  const maestro = "data" in maestroRes ? maestroRes.data : null

  return (
    <VehiculosClient
      estadoVehiculos={estadoRes.data}
      checklists={checklists}
      combustible={combustible}
      vehiculos={vehiculos}
      choferes={choferes}
      kmFlotaResumen={kmFlotaResumen}
      alertas={alertas}
      maestro={maestro}
    />
  )
}

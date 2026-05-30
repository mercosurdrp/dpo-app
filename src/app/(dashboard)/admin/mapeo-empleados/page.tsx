import { requireRole } from "@/lib/session"
import {
  getMapeosCompleto,
  getUnmappedChoferes,
  getUnmappedFleteros,
  getEmpleadosActivos,
  getEmpleadosTodos,
  getSectores,
} from "@/actions/mapeo-empleados"
import { MapeoClient } from "./mapeo-client"

export default async function MapeoEmpleadosPage() {
  await requireRole(["admin"])

  const [mapeosRes, choferesRes, fleterosRes, activosRes, todosRes, sectoresRes] =
    await Promise.all([
      getMapeosCompleto(),
      getUnmappedChoferes(),
      getUnmappedFleteros(),
      getEmpleadosActivos(),
      getEmpleadosTodos(),
      getSectores(),
    ])

  if ("error" in mapeosRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mapeo Empleados</h1>
        <p className="mt-2 text-red-500">Error: {mapeosRes.error}</p>
      </div>
    )
  }

  return (
    <MapeoClient
      mapeos={mapeosRes.data}
      unmappedChoferes={"error" in choferesRes ? [] : choferesRes.data}
      unmappedFleteros={"error" in fleterosRes ? [] : fleterosRes.data}
      empleados={"error" in activosRes ? [] : activosRes.data}
      empleadosTodos={"error" in todosRes ? [] : todosRes.data}
      sectores={"error" in sectoresRes ? [] : sectoresRes.data}
    />
  )
}

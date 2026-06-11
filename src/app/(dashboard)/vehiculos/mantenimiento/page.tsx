import {
  getCostosMantenimiento,
  getEstadoPlanFlota,
  getMantenimientos,
} from "@/actions/mantenimiento-vehiculos"
import { getProfile } from "@/lib/session"
import { MantenimientoClient } from "./mantenimiento-client"

export default async function MantenimientoPage() {
  const [estadoRes, mantenimientosRes, costosRes, profile] = await Promise.all([
    getEstadoPlanFlota(),
    getMantenimientos({ limit: 200 }),
    getCostosMantenimiento(),
    getProfile(),
  ])

  if ("error" in estadoRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mantenimiento de camiones</h1>
        <p className="mt-2 text-red-500">Error: {estadoRes.error}</p>
      </div>
    )
  }

  const mantenimientos = "data" in mantenimientosRes ? mantenimientosRes.data : []
  const costos =
    "data" in costosRes ? costosRes.data : { costoMes: 0, costoYTD: 0, porMes: [] }
  const role = profile?.role ?? "viewer"

  return (
    <MantenimientoClient
      estados={estadoRes.data.estados}
      tareas={estadoRes.data.tareas}
      overrides={estadoRes.data.overrides}
      mantenimientos={mantenimientos}
      costos={costos}
      puedeEditar={role === "admin" || role === "supervisor"}
      esAdmin={role === "admin"}
    />
  )
}

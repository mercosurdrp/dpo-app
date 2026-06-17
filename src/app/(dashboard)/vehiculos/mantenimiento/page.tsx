import { redirect } from "next/navigation"
import {
  getChecklistsMtto,
  getCostosMantenimiento,
  getEstadoPlanFlota,
  getMantenimientos,
  getTableroOperativo,
} from "@/actions/mantenimiento-vehiculos"
import { IS_MISIONES } from "@/lib/empresa"
import { getProfile } from "@/lib/session"
import { MantenimientoClient } from "./mantenimiento-client"

export default async function MantenimientoPage() {
  // Módulo solo Pampeana (la flota de Misiones se gestiona en Cloudfleet).
  if (IS_MISIONES) redirect("/")

  const [estadoRes, mantenimientosRes, costosRes, tableroRes, checklistsRes, profile] =
    await Promise.all([
      getEstadoPlanFlota(),
      getMantenimientos({ limit: 200 }),
      getCostosMantenimiento(),
      getTableroOperativo(),
      getChecklistsMtto(),
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
  const tablero =
    "data" in tableroRes ? tableroRes.data : { programacion: [], documentos: [] }
  const checklists =
    "data" in checklistsRes ? checklistsRes.data : { itemsNoOk: [], comentarios: [] }
  const role = profile?.role ?? "viewer"

  return (
    <MantenimientoClient
      estados={estadoRes.data.estados}
      tareas={estadoRes.data.tareas}
      overrides={estadoRes.data.overrides}
      mantenimientos={mantenimientos}
      costos={costos}
      tablero={tablero}
      checklists={checklists}
      puedeEditar={role === "admin" || role === "supervisor"}
      esAdmin={role === "admin"}
    />
  )
}

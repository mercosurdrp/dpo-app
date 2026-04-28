import { listarSolicitudesRRHH } from "@/actions/rrhh-licencias"
import { requireRole } from "@/lib/session"
import { LicenciasClient } from "./licencias-client"

export default async function LicenciasPage() {
  await requireRole(["admin", "admin_rrhh"])
  const res = await listarSolicitudesRRHH()
  const solicitudes = "data" in res ? res.data : []

  return <LicenciasClient solicitudes={solicitudes} />
}

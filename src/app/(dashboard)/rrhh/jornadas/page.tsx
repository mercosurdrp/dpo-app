import {
  listarAsignaciones,
  listarJornadasPlantilla,
} from "@/actions/rrhh-jornadas"
import { listarEmpleados } from "@/actions/rrhh-personal"
import { requireRole } from "@/lib/session"
import { JornadasClient } from "./jornadas-client"

export default async function JornadasPage() {
  await requireRole(["admin", "admin_rrhh"])

  const [plantillasRes, asignacionesRes, empleadosRes] = await Promise.all([
    listarJornadasPlantilla(),
    listarAsignaciones(),
    listarEmpleados({ activo: true }),
  ])

  return (
    <JornadasClient
      plantillas={"data" in plantillasRes ? plantillasRes.data : []}
      asignaciones={"data" in asignacionesRes ? asignacionesRes.data : []}
      empleados={"data" in empleadosRes ? empleadosRes.data : []}
    />
  )
}

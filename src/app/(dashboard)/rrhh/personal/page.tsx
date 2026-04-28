import { listarEmpleados } from "@/actions/rrhh-personal"
import { requireRole } from "@/lib/session"
import { PersonalClient } from "./personal-client"

export default async function PersonalPage() {
  await requireRole(["admin", "admin_rrhh"])

  const res = await listarEmpleados()
  const empleados = "data" in res ? res.data : []

  return <PersonalClient empleados={empleados} />
}

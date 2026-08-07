import { listarEntregasRRHH, listarTallesRRHH } from "@/actions/epp"
import { requireRole } from "@/lib/session"
import { EppClient } from "./epp-client"

export const dynamic = "force-dynamic"

export default async function RrhhEppPage() {
  await requireRole(["admin", "admin_rrhh"])

  const [entregasRes, tallesRes] = await Promise.all([
    listarEntregasRRHH(),
    listarTallesRRHH(),
  ])

  return (
    <EppClient
      entregas={"data" in entregasRes ? entregasRes.data : []}
      empleados={"data" in tallesRes ? tallesRes.data : []}
    />
  )
}

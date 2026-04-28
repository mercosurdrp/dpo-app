import { listarTiposLicencia } from "@/actions/rrhh-licencias"
import { listarEmpleados } from "@/actions/rrhh-personal"
import { requireRole } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { ConfiguracionClient } from "./configuracion-client"
import type { RrhhSaldoVacaciones } from "@/types/database"

export default async function ConfiguracionPage() {
  await requireRole(["admin", "admin_rrhh"])
  const supabase = await createClient()
  const anio = new Date().getFullYear()

  const [tiposRes, empleadosRes, saldosRes] = await Promise.all([
    listarTiposLicencia(),
    listarEmpleados({ activo: true }),
    supabase.from("rrhh_saldos_vacaciones").select("*").eq("anio", anio),
  ])

  return (
    <ConfiguracionClient
      tipos={"data" in tiposRes ? tiposRes.data : []}
      empleados={"data" in empleadosRes ? empleadosRes.data : []}
      saldos={(saldosRes.data ?? []) as RrhhSaldoVacaciones[]}
      anio={anio}
    />
  )
}

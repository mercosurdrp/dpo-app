import { redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  reporteLicenciasMedicas,
  reporteRepitencia,
} from "@/actions/ausentismo"
import { AusentismoReportesClient } from "./reportes-client"

export const dynamic = "force-dynamic"

function defaultRango(): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = hoy.toISOString().slice(0, 10)
  const desdeDt = new Date(hoy)
  desdeDt.setMonth(desdeDt.getMonth() - 6)
  const desde = desdeDt.toISOString().slice(0, 10)
  return { desde, hasta }
}

export default async function AusentismoReportesPage() {
  await requireRole(["admin", "admin_rrhh"])
  if (IS_MISIONES) redirect("/")

  const { desde, hasta } = defaultRango()
  const [repRes, lmRes] = await Promise.all([
    reporteRepitencia({ desde, hasta }),
    reporteLicenciasMedicas({ desde, hasta }),
  ])

  return (
    <AusentismoReportesClient
      desdeInicial={desde}
      hastaInicial={hasta}
      repitenciaInicial={"data" in repRes ? repRes.data : []}
      lmInicial={"data" in lmRes ? lmRes.data : null}
    />
  )
}

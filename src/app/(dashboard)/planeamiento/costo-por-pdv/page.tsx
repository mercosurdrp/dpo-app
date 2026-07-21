import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  getCostosMensuales,
  getCostoPorPdv,
  getBolsaDeposito,
  getKmCiudades,
  type BolsaDeposito,
  type CostoPorPdvRow,
} from "@/actions/costo-pdv"
import { CostoPdvClient } from "./costo-pdv-client"

export const dynamic = "force-dynamic"

export default async function CostoPorPdvPage() {
  // Indicador exclusivo de Pampeana.
  if (IS_MISIONES) redirect("/")

  const profile = await requireAuth()
  const canEdit = ["admin", "supervisor", "admin_rrhh"].includes(profile.role)

  const [costos, kmCiudades] = await Promise.all([getCostosMensuales(), getKmCiudades()])
  const ultimo = costos[0] ?? null

  let filasIniciales: CostoPorPdvRow[] = []
  let bolsaInicial: BolsaDeposito | null = null
  if (ultimo) {
    const [res, bolsa] = await Promise.all([
      getCostoPorPdv(ultimo.anio, ultimo.mes),
      getBolsaDeposito(ultimo.anio, ultimo.mes),
    ])
    if ("data" in res) filasIniciales = res.data
    bolsaInicial = bolsa
  }

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores/5eb1b041-6a1b-4c71-9067-0daf4f5e381a"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Planeamiento
      </Link>
      <CostoPdvClient
        costos={costos}
        mesInicial={ultimo ? { anio: ultimo.anio, mes: ultimo.mes } : null}
        filasIniciales={filasIniciales}
        bolsaInicial={bolsaInicial}
        kmCiudades={kmCiudades}
        canEdit={canEdit}
      />
    </div>
  )
}

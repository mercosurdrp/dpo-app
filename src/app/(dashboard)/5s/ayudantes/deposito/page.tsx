import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getRankingDeposito } from "@/actions/s5-deposito"
import { getEmpleadosActivos5S } from "@/actions/s5"
import { DepositoClient } from "./deposito-client"

export default async function RankingDepositoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const profile = await getProfile()

  if (IS_MISIONES) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-900">
          Ranking de ayudantes de depósito
        </h1>
        <p className="text-muted-foreground">
          Esta sección es exclusiva de Pampeana.
        </p>
      </div>
    )
  }

  const sp = await searchParams
  const res = await getRankingDeposito(sp.periodo)
  const empleadosRes = await getEmpleadosActivos5S()
  const empleados = "data" in empleadosRes ? empleadosRes.data : []
  const canEdit = profile?.role === "admin" || profile?.role === "auditor"

  if ("error" in res) {
    return (
      <div className="space-y-3">
        <Link
          href="/5s/ayudantes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a ayudantes
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          Ranking de ayudantes de depósito
        </h1>
        <p className="text-red-500">{res.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/5s/ayudantes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a ayudantes
      </Link>
      <DepositoClient data={res.data} empleados={empleados} canEdit={canEdit} />
    </div>
  )
}

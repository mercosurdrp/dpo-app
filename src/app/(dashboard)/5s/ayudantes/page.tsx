import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getRankingDeposito } from "@/actions/s5-deposito"
import { getRankingMisiones } from "@/actions/s5-ayudantes-misiones"
import { getEmpleadosActivos5S } from "@/actions/s5"
import { DepositoClient } from "./deposito-client"
import { MisionesClient } from "./misiones-client"

export default async function AyudantesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const profile = await getProfile()

  if (IS_MISIONES) {
    const sp = await searchParams
    const res = await getRankingMisiones(sp.periodo)
    return (
      <div className="space-y-4">
        <Link
          href="/5s?tipo=flota"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a 5S
        </Link>
        {"error" in res ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              Ranking de ayudantes
            </h1>
            <p className="text-red-500">{res.error}</p>
          </>
        ) : (
          <MisionesClient data={res.data} />
        )}
      </div>
    )
  }

  const sp = await searchParams
  const res = await getRankingDeposito(sp.periodo)
  const empleadosRes = await getEmpleadosActivos5S()
  const empleados = "data" in empleadosRes ? empleadosRes.data : []
  const canEdit = profile?.role === "admin" || profile?.role === "auditor"

  return (
    <div className="space-y-4">
      <Link
        href="/5s?tipo=almacen"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a 5S
      </Link>
      {"error" in res ? (
        <>
          <h1 className="text-2xl font-bold text-slate-900">
            Ranking de ayudantes
          </h1>
          <p className="text-red-500">{res.error}</p>
        </>
      ) : (
        <DepositoClient data={res.data} empleados={empleados} canEdit={canEdit} />
      )}
    </div>
  )
}

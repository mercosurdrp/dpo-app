import Link from "next/link"
import { ArrowLeft, Package } from "lucide-react"
import { getPeriodoActual, getS5RankingAyudantes } from "@/actions/s5"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { AyudantesClient } from "./ayudantes-client"

export default async function AyudantesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; alcance?: string }>
}) {
  const profile = await getProfile()
  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Ranking de ayudantes 5S
        </h1>
        <p className="mt-2 text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  const sp = await searchParams
  const periodoActual = await getPeriodoActual()
  const alcance = sp.alcance === "mes" ? "mes" : "global"
  const periodoInicial = sp.periodo ?? periodoActual

  const ranking = await getS5RankingAyudantes(
    alcance === "mes" ? periodoInicial : undefined
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/5s?tipo=flota"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a 5S
        </Link>
        {!IS_MISIONES && (
          <Link
            href="/5s/ayudantes/deposito"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            <Package className="h-4 w-4" /> Ranking de depósito (bimestral)
          </Link>
        )}
      </div>
      <AyudantesClient
        rankingInicial={"error" in ranking ? [] : ranking.data}
        alcanceInicial={alcance}
        periodoInicial={periodoInicial}
        periodoActual={periodoActual}
      />
    </div>
  )
}

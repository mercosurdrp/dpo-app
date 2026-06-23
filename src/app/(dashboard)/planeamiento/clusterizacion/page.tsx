import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getClusterizacion } from "@/actions/clusterizacion"
import { IS_MISIONES } from "@/lib/empresa"
import { ClusterizacionClient } from "./clusterizacion-client"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ dias?: string }>
}

const DIAS_VALIDOS = new Set([30, 60, 90, 180])

export default async function ClusterizacionPage({ searchParams }: Props) {
  if (IS_MISIONES) redirect("/indicadores")

  const { dias } = await searchParams
  const parsed = dias ? parseInt(dias, 10) : 90
  const diasPeriodo = DIAS_VALIDOS.has(parsed) ? parsed : 90

  const res = await getClusterizacion(diasPeriodo)

  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>

      {"error" in res ? (
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Clusterización de Clientes
          </h1>
          <p className="mt-2 text-red-500">Error: {res.error}</p>
        </div>
      ) : (
        <ClusterizacionClient data={res.data} diasPeriodo={diasPeriodo} />
      )}
    </div>
  )
}

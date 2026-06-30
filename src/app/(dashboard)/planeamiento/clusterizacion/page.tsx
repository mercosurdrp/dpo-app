import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getClusterizacion } from "@/actions/clusterizacion"
import { getPlanesCluster, getPlanesCubo } from "@/actions/clusterizacion-planes"
import { IS_MISIONES } from "@/lib/empresa"
import { ClusterizacionClient } from "./clusterizacion-client"

export const dynamic = "force-dynamic"

export default async function ClusterizacionPage() {
  if (IS_MISIONES) redirect("/indicadores")

  const [res, planes, planesCubo] = await Promise.all([
    getClusterizacion(),
    getPlanesCluster(),
    getPlanesCubo(),
  ])

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
        <ClusterizacionClient data={res.data} planesIniciales={planes} planesCuboIniciales={planesCubo} />
      )}
    </div>
  )
}

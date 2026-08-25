import { getArbolKpiRechazo } from "@/actions/arbol-kpi"
import { ArbolKpiClient } from "./arbol-kpi-client"

export const dynamic = "force-dynamic"

export default async function ArbolKpiPage() {
  const result = await getArbolKpiRechazo()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Árbol KPI</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return <ArbolKpiClient data={result.data} />
}

import { getArbolKpiRechazo } from "@/actions/arbol-kpi"
import { getArbolKpiConfig } from "@/actions/arbol-kpi-config"
import { requireAuth } from "@/lib/session"
import { ArbolKpiClient } from "./arbol-kpi-client"

export const dynamic = "force-dynamic"

export default async function ArbolKpiPage() {
  const profile = await requireAuth()
  const [result, config] = await Promise.all([
    getArbolKpiRechazo(),
    getArbolKpiConfig(),
  ])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Árbol KPI</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <ArbolKpiClient
      data={result.data}
      config={config}
      puedeEditar={["admin", "supervisor", "admin_rrhh"].includes(profile.role)}
    />
  )
}

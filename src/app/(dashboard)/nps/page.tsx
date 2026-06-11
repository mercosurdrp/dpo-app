import { getNpsDashboard } from "@/actions/nps"
import { listarPlanesNps } from "@/actions/nps-planes"
import { NpsClient } from "./_components/nps-client"

export const dynamic = "force-dynamic"

export default async function NpsPage() {
  const [datos, planes] = await Promise.all([
    getNpsDashboard(),
    listarPlanesNps(),
  ])

  if ("error" in datos) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">NPS</h1>
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el dashboard de NPS: {datos.error}
        </p>
      </div>
    )
  }

  return (
    <NpsClient
      data={datos.data}
      planesIniciales={"data" in planes ? planes.data : []}
    />
  )
}

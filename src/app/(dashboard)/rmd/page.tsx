import { getRmdDashboard } from "@/actions/rmd"
import { getRmdCobertura } from "@/actions/rmd-cobertura"
import { listarPlanesRmd } from "@/actions/rmd-planes"
import {
  listarGanadoresSorteoRmd,
  resumenSorteoRmd,
} from "@/actions/rmd-sorteo"
import { RmdClient } from "./_components/rmd-client"

export const dynamic = "force-dynamic"

export default async function RmdPage() {
  const [datos, planes, cobertura, resumenSorteo, ganadores] = await Promise.all([
    getRmdDashboard(),
    listarPlanesRmd(),
    getRmdCobertura(),
    resumenSorteoRmd(),
    listarGanadoresSorteoRmd(),
  ])

  if ("error" in datos) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">RMD</h1>
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el dashboard de RMD: {datos.error}
        </p>
      </div>
    )
  }

  return (
    <RmdClient
      data={datos.data}
      planesIniciales={"data" in planes ? planes.data : []}
      cobertura={"data" in cobertura ? cobertura.data : null}
      resumenSorteo={"data" in resumenSorteo ? resumenSorteo.data : null}
      ganadoresSorteo={"data" in ganadores ? ganadores.data : null}
    />
  )
}

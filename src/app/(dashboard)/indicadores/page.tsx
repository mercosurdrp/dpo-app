import { getPilaresConIndicadores } from "@/actions/indicadores"
import { IndicadoresLandingClient } from "./indicadores-landing-client"

export default async function IndicadoresPage() {
  const res = await getPilaresConIndicadores()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Indicadores</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return <IndicadoresLandingClient pilares={res.data} />
}

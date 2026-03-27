import { getAcciones } from "@/actions/acciones"
import { AccionesClient } from "./acciones-client"

export default async function AccionesPage() {
  const result = await getAcciones()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan de Accion</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return <AccionesClient acciones={result.data} />
}

import { getCapacitaciones } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { CapacitacionesClient } from "./capacitaciones-client"

export default async function CapacitacionesPage() {
  const [result, profile] = await Promise.all([getCapacitaciones(), getProfile()])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Capacitaciones</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const canEdit = profile?.role === "admin" || profile?.role === "auditor"

  return <CapacitacionesClient capacitaciones={result.data} canEdit={canEdit} />
}

import { getMisCapacitaciones } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { MisCapacitacionesClient } from "./mis-capacitaciones-client"

export default async function MisCapacitacionesPage() {
  const [result, profile] = await Promise.all([getMisCapacitaciones(), getProfile()])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mis Capacitaciones</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <MisCapacitacionesClient
      capacitaciones={result.data}
      nombre={profile?.nombre ?? ""}
    />
  )
}

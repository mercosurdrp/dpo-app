import { getMisTickets, getTickets } from "@/actions/portal-servicios"
import { getProfile } from "@/lib/session"
import { ServiciosClient } from "./servicios-client"

export default async function ServiciosPage() {
  const profile = await getProfile()
  const canManage = profile?.role === "admin"

  const result = canManage ? await getTickets() : await getMisTickets()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Servicios Generales</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return <ServiciosClient tickets={result.data} canManage={canManage} />
}

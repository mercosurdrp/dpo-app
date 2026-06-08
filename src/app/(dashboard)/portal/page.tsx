import { redirect } from "next/navigation"
import { getProfile } from "@/lib/session"
import { getComunicacionesDashboard } from "@/actions/portal-comunicaciones"
import { getServiciosDashboard } from "@/actions/portal-servicios"
import { PortalDashboardClient } from "./portal-dashboard-client"

export default async function PortalPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  // El empleado no ve dashboards: lo mandamos al buzón.
  if (profile.role !== "admin") redirect("/portal/comunicaciones")

  const [com, serv] = await Promise.all([
    getComunicacionesDashboard(),
    getServiciosDashboard(),
  ])

  if ("error" in com) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portal del Empleado</h1>
        <p className="mt-2 text-red-500">Error: {com.error}</p>
      </div>
    )
  }
  if ("error" in serv) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portal del Empleado</h1>
        <p className="mt-2 text-red-500">Error: {serv.error}</p>
      </div>
    )
  }

  return <PortalDashboardClient comunicaciones={com.data} servicios={serv.data} />
}

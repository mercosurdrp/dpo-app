import { getMisCapacitaciones } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { getEstadoReunionHoy } from "@/actions/reunion-preruta"
import { getMiDashboard } from "@/actions/mi-asistencia"
import { MisCapacitacionesClient } from "./mis-capacitaciones-client"

export default async function MisCapacitacionesPage() {
  const [result, profile, reunionRes, dashRes] = await Promise.all([
    getMisCapacitaciones(),
    getProfile(),
    getEstadoReunionHoy(),
    getMiDashboard(),
  ])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi Panel</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const reunion = "data" in reunionRes ? reunionRes.data : { marcado: false, hora_checkin: null, minutos: null }
  const dashboard = "data" in dashRes ? dashRes.data : null

  return (
    <MisCapacitacionesClient
      capacitaciones={result.data}
      nombre={profile?.nombre ?? ""}
      reunion={reunion}
      dashboard={dashboard}
    />
  )
}

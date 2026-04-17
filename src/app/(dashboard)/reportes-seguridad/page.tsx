import { getReportes } from "@/actions/reportes-seguridad"
import { getProfile } from "@/lib/session"
import { ReportesSeguridadClient } from "./reportes-client"

export default async function ReportesSeguridadPage() {
  const [result, profile] = await Promise.all([getReportes(), getProfile()])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes de Seguridad</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes de Seguridad</h1>
        <p className="mt-2 text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  return (
    <ReportesSeguridadClient
      reportes={result.data}
      currentProfileId={profile.id}
      currentRole={profile.role}
    />
  )
}

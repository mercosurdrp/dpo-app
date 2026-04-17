import { getSugerencias } from "@/actions/sugerencias"
import { getProfile } from "@/lib/session"
import { SugerenciasClient } from "./sugerencias-client"

export default async function SugerenciasPage() {
  const [result, profile] = await Promise.all([getSugerencias(), getProfile()])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sugerencias y Mejoras</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sugerencias y Mejoras</h1>
        <p className="mt-2 text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  return (
    <SugerenciasClient
      sugerencias={result.data}
      currentProfileId={profile.id}
      currentRole={profile.role}
    />
  )
}

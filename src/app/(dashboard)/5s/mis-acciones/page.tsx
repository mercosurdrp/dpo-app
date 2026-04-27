import { getMisAcciones } from "@/actions/s5"
import { getProfile } from "@/lib/session"
import { MisAccionesClient } from "./mis-acciones-client"

export default async function MisAccionesPage() {
  const [result, profile] = await Promise.all([getMisAcciones(), getProfile()])

  if (!profile) {
    return (
      <div className="p-4">
        <p className="text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <MisAccionesClient
      acciones={result.data}
      currentUserId={profile.id}
      currentRole={profile.role}
    />
  )
}

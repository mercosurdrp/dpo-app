import { getComunicaciones } from "@/actions/portal-comunicaciones"
import { getProfile } from "@/lib/session"
import { ComunicacionesClient } from "./comunicaciones-client"

export default async function ComunicacionesPage() {
  const [result, profile] = await Promise.all([getComunicaciones(), getProfile()])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Buzón de Comunicaciones</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const canManage = profile?.role === "admin"

  return <ComunicacionesClient comunicaciones={result.data} canManage={canManage} />
}

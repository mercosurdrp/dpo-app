import { getAuditoria, getSectoresAlmacen } from "@/actions/s5"
import { getProfile } from "@/lib/session"
import { AuditoriaClient } from "./auditoria-client"

export default async function AuditoriaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [result, profile, sectoresRes] = await Promise.all([
    getAuditoria(id),
    getProfile(),
    getSectoresAlmacen(),
  ])

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="p-4">
        <p className="text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  const sectoresAlmacen = "error" in sectoresRes ? [] : sectoresRes.data

  return (
    <AuditoriaClient
      auditoria={result.data}
      currentRole={profile.role}
      sectoresAlmacen={sectoresAlmacen}
    />
  )
}

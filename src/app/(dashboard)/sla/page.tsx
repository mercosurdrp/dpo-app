import { getSlas } from "@/actions/sla"
import { getProfile } from "@/lib/session"
import { SlaClient } from "./sla-client"

export default async function SlaPage() {
  const [result, profile] = await Promise.all([getSlas(), getProfile()])

  if ("error" in result) {
    return (
      <div className="p-6 text-sm text-red-600">Error: {result.error}</div>
    )
  }
  if (!profile) {
    return <div className="p-6 text-sm">No se pudo cargar tu perfil.</div>
  }

  return <SlaClient slas={result.data} currentRole={profile.role} />
}

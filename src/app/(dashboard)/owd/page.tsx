import { getOwdTemplates } from "@/actions/owd"
import { requireAuth } from "@/lib/session"
import { OwdLandingClient } from "./owd-landing-client"

export default async function OwdPage() {
  const profile = await requireAuth()
  const res = await getOwdTemplates()

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">OWD</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <OwdLandingClient
      templates={res.data}
      isAdmin={profile.role === "admin"}
      canAgenda={profile.role === "admin" || profile.role === "supervisor"}
    />
  )
}

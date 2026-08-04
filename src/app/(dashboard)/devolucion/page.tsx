import { getDevolucion } from "@/actions/devolucion"
import { requireAuth } from "@/lib/session"
import { DevolucionClient } from "./devolucion-client"

export const dynamic = "force-dynamic"

export default async function DevolucionPage() {
  const profile = await requireAuth()
  const result = await getDevolucion()

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Devolución H1</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <DevolucionClient
      preguntas={result.data}
      isAdmin={profile.role === "admin" || profile.role === "admin_rrhh"}
    />
  )
}

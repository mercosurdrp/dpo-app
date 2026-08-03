import { redirect } from "next/navigation"
import { getProfile } from "@/lib/session"
import { getPanelSectores5S } from "@/actions/s5-mi-sector"
import { SectoresClient } from "./sectores-client"

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`
}

export default async function SectoresPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const { periodo: periodoParam } = await searchParams
  const periodo = periodoParam ?? periodoActual()

  const res = await getPanelSectores5S(periodo)

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tareas por sector</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <SectoresClient
      sectores={res.data}
      periodo={periodo}
      puedeEditar={profile.role === "admin" || profile.role === "auditor"}
    />
  )
}

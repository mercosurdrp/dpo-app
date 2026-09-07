import { getCampusResumen } from "@/actions/campus"
import { getProfile } from "@/lib/session"
import { CampusClient } from "./campus-client"

export const metadata = {
  title: "Campus de Capacitaciones",
}

export default async function CampusPage() {
  const [resumen, profile] = await Promise.all([getCampusResumen(), getProfile()])

  const canEdit = profile?.role === "admin" || profile?.role === "admin_rrhh"

  if ("error" in resumen) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Campus de Capacitaciones</h1>
        <p className="mt-2 text-red-500">Error: {resumen.error}</p>
      </div>
    )
  }

  return <CampusClient resumen={resumen.data} canEdit={canEdit} />
}

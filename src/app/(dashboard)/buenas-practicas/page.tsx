import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getBuenasPracticasDashboard } from "@/actions/buenas-practicas"
import { BuenasPracticasClient } from "./buenas-practicas-client"

export const dynamic = "force-dynamic"

export default async function BuenasPracticasPage() {
  const profile = await requireAuth()
  // Módulo exclusivo de Pampeana (punto 4.4 Gestión).
  if (IS_MISIONES) redirect("/")
  // El empleado usa su propia pantalla para enviar ideas.
  if (profile.role === "empleado") redirect("/mis-buenas-practicas")

  const res = await getBuenasPracticasDashboard()
  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Buenas Prácticas</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  const esEditor = ["admin", "supervisor", "admin_rrhh"].includes(profile.role)

  return <BuenasPracticasClient dashboard={res.data} esEditor={esEditor} />
}

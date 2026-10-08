import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getSopsEmpleado } from "@/actions/sops-empleado"
import { SopsClient } from "./sops-client"

export const metadata = {
  title: "SOPs | Procedimientos de todos los pilares",
}

export default async function SopsPage() {
  await requireAuth()
  await requireModuloPortal("sops")

  const res = await getSopsEmpleado()
  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SOPs</h1>
        <p className="mt-2 text-red-500">No se pudieron cargar los SOPs: {res.error}</p>
      </div>
    )
  }

  return <SopsClient pilares={res.data} />
}

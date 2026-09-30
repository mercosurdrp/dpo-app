import { getMisRechazos } from "@/actions/mis-rechazos"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { MisRechazosClient } from "./mis-rechazos-client"

export const dynamic = "force-dynamic"

export default async function MisRechazosPage() {
  await requireModuloPortal("mis-rechazos")

  const res = await getMisRechazos()
  if ("error" in res) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {res.error}
      </div>
    )
  }

  return <MisRechazosClient data={res.data} />
}

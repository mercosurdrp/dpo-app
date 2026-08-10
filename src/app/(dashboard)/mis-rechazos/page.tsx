import { redirect } from "next/navigation"
import { IS_MISIONES } from "@/lib/empresa"
import { getMisRechazos } from "@/actions/mis-rechazos"
import { MisRechazosClient } from "./mis-rechazos-client"

export const dynamic = "force-dynamic"

export default async function MisRechazosPage() {
  // Rechazos: fuente de datos solo en Pampeana (Chess + Gestión).
  if (IS_MISIONES) redirect("/")

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

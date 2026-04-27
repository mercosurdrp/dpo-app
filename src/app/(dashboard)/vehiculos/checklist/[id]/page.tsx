import { getChecklistDetalle } from "@/actions/checklist-vehiculos"
import { ChecklistDetalleClient } from "./checklist-detalle-client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function ChecklistDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const result = await getChecklistDetalle(id)

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Checklist</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/vehiculos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Vehículos
      </Link>
      <ChecklistDetalleClient checklist={result.data} />
    </div>
  )
}

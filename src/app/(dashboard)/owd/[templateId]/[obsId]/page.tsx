import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getObservacionById } from "@/actions/owd"
import { DetalleOwdClient } from "./detalle-owd-client"

export default async function DetalleOwdPage({
  params,
}: {
  params: Promise<{ templateId: string; obsId: string }>
}) {
  const { templateId, obsId } = await params
  const res = await getObservacionById(obsId)

  if ("error" in res) {
    if (res.error.includes("No rows")) notFound()
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">OWD</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/owd/${templateId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <DetalleOwdClient
        templateId={templateId}
        observacion={res.data.observacion}
        respuestas={res.data.respuestas}
        items={res.data.items}
        fotos={res.data.fotos}
      />
    </div>
  )
}

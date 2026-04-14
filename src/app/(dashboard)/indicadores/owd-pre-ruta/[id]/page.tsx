import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getObservacionById } from "@/actions/owd-pre-ruta"
import { DetalleOwdClient } from "./detalle-owd-client"

export default async function DetalleOwdPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const res = await getObservacionById(id)

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
        href="/indicadores/owd-pre-ruta"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <DetalleOwdClient
        observacion={res.data.observacion}
        respuestas={res.data.respuestas}
        items={res.data.items}
      />
    </div>
  )
}

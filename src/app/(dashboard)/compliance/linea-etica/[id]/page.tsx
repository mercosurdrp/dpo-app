import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getDenuncia } from "@/actions/linea-etica"
import { DenunciaDetalleClient } from "./denuncia-detalle-client"

export default async function DenunciaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const res = await getDenuncia(id)

  if ("error" in res) {
    return (
      <div className="space-y-4">
        <Link
          href="/compliance/linea-etica"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
        >
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {res.error}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/compliance/linea-etica"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Volver a Línea Ética
      </Link>
      <DenunciaDetalleClient denuncia={res.data} />
    </div>
  )
}

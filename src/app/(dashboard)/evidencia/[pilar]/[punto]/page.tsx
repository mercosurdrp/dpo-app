import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getArchivos } from "@/actions/dpo-evidencia"
import { EvidenciaPuntoClient } from "./evidencia-punto-client"

export default async function EvidenciaPuntoPage({
  params,
}: {
  params: Promise<{ pilar: string; punto: string }>
}) {
  const { pilar, punto } = await params
  const puntoCodigo = punto.replace("-", ".")
  const res = await getArchivos({
    pilar_codigo: pilar,
    punto_codigo: puntoCodigo,
    archivado: false,
  })
  const archivos = "data" in res ? res.data : []
  return (
    <div className="space-y-4">
      <Link
        href="/evidencia"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Evidencia
      </Link>
      <EvidenciaPuntoClient
        pilarCodigo={pilar}
        puntoCodigo={puntoCodigo}
        archivos={archivos}
      />
    </div>
  )
}

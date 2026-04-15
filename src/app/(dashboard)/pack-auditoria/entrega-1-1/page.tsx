import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPackAuditoria11 } from "@/actions/pack-auditoria"
import { getArchivos } from "@/actions/dpo-evidencia"
import { PackAuditoria11Client } from "./pack-client"

export default async function PackAuditoria11Page() {
  const [res, archivosRes] = await Promise.all([
    getPackAuditoria11(),
    getArchivos({ pilar_codigo: "entrega", punto_codigo: "1.1", archivado: false }),
  ])
  const archivos = "data" in archivosRes ? archivosRes.data : []

  if ("error" in res) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pack Auditoría 1.1</h1>
        <p className="mt-2 text-red-500">Error: {res.error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <PackAuditoria11Client pack={res.data} archivos={archivos} />
    </div>
  )
}

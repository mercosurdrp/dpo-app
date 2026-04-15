import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getPackAuditoria11 } from "@/actions/pack-auditoria"
import { PackAuditoria11Client } from "./pack-client"

export default async function PackAuditoria11Page() {
  const res = await getPackAuditoria11()

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
      <PackAuditoria11Client pack={res.data} />
    </div>
  )
}

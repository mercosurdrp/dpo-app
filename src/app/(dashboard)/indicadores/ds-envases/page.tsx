import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DsEnvasesClient } from "./ds-envases-client"

export const metadata = { title: "DS de Envases · Quilmes" }

export default function DsEnvasesPage() {
  return (
    <div className="space-y-4">
      <Link
        href="/indicadores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
      </Link>
      <DsEnvasesClient />
    </div>
  )
}

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getActividad } from "@/actions/dpo-evidencia"
import { TimelineClient } from "./timeline-client"

export default async function TimelinePage() {
  const res = await getActividad({ limit: 200 })
  const actividad = "data" in res ? res.data : []
  return (
    <div className="space-y-4">
      <Link
        href="/evidencia"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a Evidencia
      </Link>
      <TimelineClient actividad={actividad} />
    </div>
  )
}

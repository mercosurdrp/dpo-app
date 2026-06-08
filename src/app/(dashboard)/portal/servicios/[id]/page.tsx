import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getTicket, getAsignables } from "@/actions/portal-servicios"
import { getProfile } from "@/lib/session"
import { TicketDetailClient } from "./ticket-detail-client"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile()
  const canManage = profile?.role === "admin"

  const [result, asignablesRes] = await Promise.all([
    getTicket(id),
    canManage ? getAsignables() : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])

  if ("error" in result) {
    return (
      <div className="space-y-4">
        <Link href="/portal/servicios" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" />
          Volver
        </Link>
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const asignables = "data" in asignablesRes ? asignablesRes.data : []

  return (
    <TicketDetailClient
      ticket={result.data}
      canManage={canManage}
      asignables={asignables}
    />
  )
}

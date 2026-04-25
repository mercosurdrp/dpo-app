import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { ZonasEditorClient } from "./zonas-client"

export const dynamic = "force-dynamic"

export default async function ZonasEditorPage() {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    redirect("/indicadores/foxtrot-tracking")
  }
  return (
    <div className="space-y-3">
      <Link
        href="/indicadores/foxtrot-tracking"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver al tablero
      </Link>
      <ZonasEditorClient />
    </div>
  )
}

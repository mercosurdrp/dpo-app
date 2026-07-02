import Link from "next/link"
import { ArrowLeft, Bell, MapPin } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { FoxtrotTrackingClient } from "./tracking-client"

export const dynamic = "force-dynamic"

export default async function FoxtrotTrackingPage() {
  const profile = await requireAuth()
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/indicadores"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Indicadores
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/indicadores/foxtrot-tracking/alertas"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Bell className="h-3.5 w-3.5" /> Alertas de rechazo
          </Link>
          {profile.role === "admin" && (
            <Link
              href="/indicadores/foxtrot-tracking/zonas"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <MapPin className="h-3.5 w-3.5" /> Configurar zonas
            </Link>
          )}
        </div>
      </div>
      <FoxtrotTrackingClient isAdmin={profile.role === "admin"} />
    </div>
  )
}

import Link from "next/link"
import { ArrowLeft, Users } from "lucide-react"
import { requireAuth } from "@/lib/session"
import { getAlertas, getConfigAlertas } from "@/actions/foxtrot-alertas"
import { AlertasRechazoClient } from "./alertas-client"

export const dynamic = "force-dynamic"

function fechaArtMenosDias(dias: number): string {
  return new Date(Date.now() - 3 * 3600_000 - dias * 86_400_000).toISOString().slice(0, 10)
}

export default async function AlertasRechazoPage() {
  const profile = await requireAuth()
  const desde = fechaArtMenosDias(30)
  const [alertasRes, configRes] = await Promise.all([
    getAlertas({ desde }),
    getConfigAlertas(),
  ])
  const alertas = "data" in alertasRes ? alertasRes.data : []
  const config = "data" in configRes ? configRes.data : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/indicadores/foxtrot-tracking"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al tablero
        </Link>
        {profile.role === "admin" && (
          <Link
            href="/indicadores/foxtrot-tracking/alertas/equipo"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Users className="h-3.5 w-3.5" /> Equipo y configuración
          </Link>
        )}
      </div>
      <AlertasRechazoClient
        alertasIniciales={alertas}
        config={config}
        desdeInicial={desde}
      />
    </div>
  )
}

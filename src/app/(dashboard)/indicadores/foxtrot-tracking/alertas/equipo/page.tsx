import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { getConfigAlertas, getEquipoWa } from "@/actions/foxtrot-alertas"
import { EquipoWaClient } from "./equipo-client"

export const dynamic = "force-dynamic"

export default async function EquipoWaPage() {
  const profile = await requireAuth()
  if (profile.role !== "admin") {
    redirect("/indicadores/foxtrot-tracking/alertas")
  }
  const [equipoRes, configRes] = await Promise.all([getEquipoWa(), getConfigAlertas()])
  return (
    <div className="space-y-3">
      <Link
        href="/indicadores/foxtrot-tracking/alertas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a alertas
      </Link>
      <EquipoWaClient
        equipoInicial={"data" in equipoRes ? equipoRes.data : []}
        configInicial={"data" in configRes ? configRes.data : null}
      />
    </div>
  )
}

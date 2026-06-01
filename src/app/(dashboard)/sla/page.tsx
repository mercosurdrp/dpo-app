import { getSlas, getCumplimientoMes } from "@/actions/sla"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import type { CumplimientoMes } from "@/lib/sla-cumplimiento"
import { SlaClient } from "./sla-client"

/** Mes actual en hora Argentina (UTC-3, sin DST). */
function mesActualARG(): { year: number; month: number } {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

export default async function SlaPage() {
  const [result, profile] = await Promise.all([getSlas(), getProfile()])

  if ("error" in result) {
    return (
      <div className="p-6 text-sm text-red-600">Error: {result.error}</div>
    )
  }
  if (!profile) {
    return <div className="p-6 text-sm">No se pudo cargar tu perfil.</div>
  }

  // Cumplimiento de SLA del mes (Pampeana-only: depende de ruteo_cierres).
  let cumplimiento: CumplimientoMes | null = null
  if (!IS_MISIONES) {
    const { year, month } = mesActualARG()
    const r = await getCumplimientoMes(year, month)
    if (!("error" in r)) cumplimiento = r.data
  }

  return (
    <SlaClient
      slas={result.data}
      currentRole={profile.role}
      cumplimiento={cumplimiento}
    />
  )
}

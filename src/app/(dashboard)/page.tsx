import { getDashboardData } from "@/actions/dashboard"
import { getResumenPuntos } from "@/actions/dpo-evidencia"
import { createClient } from "@/lib/supabase/server"
import type { DpoPuntoResumen, Pilar } from "@/types/database"
import { DashboardClient } from "./dashboard-client"

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch in parallel: pilares list, dashboard data (audit scores), resumen por punto
  const [pilaresRes, data, resumenRes] = await Promise.all([
    supabase.from("pilares").select("*").order("orden"),
    getDashboardData(),
    getResumenPuntos(),
  ])

  if ("error" in data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard DPO</h1>
        <p className="mt-2 text-red-500">Error: {data.error}</p>
      </div>
    )
  }

  const resumenPuntos: DpoPuntoResumen[] =
    "data" in resumenRes ? resumenRes.data : []

  return (
    <DashboardClient
      data={data}
      pilares={(pilaresRes.data ?? []) as Pilar[]}
      resumenPuntos={resumenPuntos}
    />
  )
}

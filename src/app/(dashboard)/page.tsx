import { getDashboardData } from "@/actions/dashboard"
import { createClient } from "@/lib/supabase/server"
import type { Pilar } from "@/types/database"
import { DashboardClient } from "./dashboard-client"

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch all pilares
  const { data: pilares } = await supabase
    .from("pilares")
    .select("*")
    .order("orden")

  // Fetch dashboard data (includes latest audit scores)
  const data = await getDashboardData()

  if ("error" in data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard DPO</h1>
        <p className="mt-2 text-red-500">Error: {data.error}</p>
      </div>
    )
  }

  return (
    <DashboardClient
      data={data}
      pilares={(pilares ?? []) as Pilar[]}
    />
  )
}

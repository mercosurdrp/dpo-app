import { getDashboardData } from "@/actions/dashboard"
import { DashboardClient } from "./dashboard-client"

export default async function DashboardPage() {
  const data = await getDashboardData()

  if ("error" in data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard DPO</h1>
        <p className="mt-2 text-red-500">Error: {data.error}</p>
      </div>
    )
  }

  return <DashboardClient data={data} />
}

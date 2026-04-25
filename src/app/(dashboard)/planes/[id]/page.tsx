import { getPlanDetail } from "@/actions/planes"
import { getProfile } from "@/lib/session"
import { PlanDetailClient } from "./plan-detail-client"

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [result, profile] = await Promise.all([getPlanDetail(id), getProfile()])

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return (
    <PlanDetailClient
      plan={result.data}
      currentRole={profile?.role ?? "viewer"}
    />
  )
}

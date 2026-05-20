import { getPlanDetail } from "@/actions/planes"
import { listarAvancesPlan } from "@/actions/plan-avances"
import { getProfile } from "@/lib/session"
import { PlanDetailClient } from "./plan-detail-client"

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [result, profile, avancesResult] = await Promise.all([
    getPlanDetail(id),
    getProfile(),
    listarAvancesPlan(id),
  ])

  if ("error" in result) {
    return (
      <div className="p-4">
        <p className="text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const canEditPunto =
    profile?.role === "admin" ||
    profile?.role === "auditor" ||
    profile?.puede_asignar_tareas === true

  const isEditor =
    profile?.role === "admin" ||
    profile?.role === "supervisor" ||
    profile?.role === "admin_rrhh"
  const isCreator = profile?.id === result.data.created_by
  const isResponsable = (result.data.responsables ?? []).some(
    (r) => r.profile_id === profile?.id,
  )
  const puedeIntervenirEnAvances = !!(isEditor || isCreator || isResponsable)

  const avancesIniciales =
    "data" in avancesResult ? avancesResult.data : []

  return (
    <PlanDetailClient
      plan={result.data}
      currentRole={profile?.role ?? "viewer"}
      canEditPunto={canEditPunto}
      avancesIniciales={avancesIniciales}
      puedeIntervenirEnAvances={puedeIntervenirEnAvances}
    />
  )
}

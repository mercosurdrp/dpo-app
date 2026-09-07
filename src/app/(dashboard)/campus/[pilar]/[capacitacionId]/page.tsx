import { notFound } from "next/navigation"
import { getCampusCapacitacion, getCampusMateriales } from "@/actions/campus"
import { getProfile } from "@/lib/session"
import { esPilarValido, pilarPorCodigo } from "@/lib/campus"
import { CapacitacionClient } from "./capacitacion-client"

export default async function CampusCapacitacionPage({
  params,
}: {
  params: Promise<{ pilar: string; capacitacionId: string }>
}) {
  const { pilar, capacitacionId } = await params
  if (!esPilarValido(pilar)) notFound()

  const [capResult, matResult, profile] = await Promise.all([
    getCampusCapacitacion(capacitacionId),
    getCampusMateriales(capacitacionId),
    getProfile(),
  ])

  const canEdit = profile?.role === "admin" || profile?.role === "admin_rrhh"
  const info = pilarPorCodigo(pilar)!

  if ("error" in capResult) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Capacitación</h1>
        <p className="mt-2 text-red-500">Error: {capResult.error}</p>
      </div>
    )
  }

  return (
    <CapacitacionClient
      pilar={info}
      capacitacion={capResult.data}
      materiales={"error" in matResult ? [] : matResult.data}
      errorMateriales={"error" in matResult ? matResult.error : null}
      canEdit={canEdit}
    />
  )
}

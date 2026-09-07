import { notFound } from "next/navigation"
import { getCampusCapacitaciones } from "@/actions/campus"
import { getProfile } from "@/lib/session"
import { esPilarValido, pilarPorCodigo } from "@/lib/campus"
import { PilarClient } from "./pilar-client"

export default async function CampusPilarPage({
  params,
}: {
  params: Promise<{ pilar: string }>
}) {
  const { pilar } = await params
  if (!esPilarValido(pilar)) notFound()

  const [result, profile] = await Promise.all([getCampusCapacitaciones(pilar), getProfile()])
  const canEdit = profile?.role === "admin" || profile?.role === "admin_rrhh"
  const info = pilarPorCodigo(pilar)!

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{info.nombre}</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  return <PilarClient pilar={info} capacitaciones={result.data} canEdit={canEdit} />
}

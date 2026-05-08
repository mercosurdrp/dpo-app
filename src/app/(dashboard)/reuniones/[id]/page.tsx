import { redirect } from "next/navigation"
import {
  getReunionDetalle,
  getIndicadoresMes,
  listResponsablesPosibles,
  puedeEditarReuniones,
} from "@/actions/reuniones"
import { getProfile } from "@/lib/session"
import { ReunionDetallePageClient } from "./reunion-detalle-page-client"

export default async function ReunionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [profile, detalleRes, indicadoresMesRes, respRes, puedeEditar] =
    await Promise.all([
      getProfile(),
      getReunionDetalle(id),
      getIndicadoresMes(id),
      listResponsablesPosibles(),
      puedeEditarReuniones(),
    ])

  if (!profile) redirect("/login")

  if ("error" in detalleRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reunión</h1>
        <p className="mt-2 text-red-500">Error: {detalleRes.error}</p>
      </div>
    )
  }

  return (
    <ReunionDetallePageClient
      detalle={detalleRes.data}
      indicadoresMes={
        "data" in indicadoresMesRes ? indicadoresMesRes.data : null
      }
      responsables={"data" in respRes ? respRes.data : []}
      puedeEditar={puedeEditar}
      currentProfileId={profile.id}
    />
  )
}

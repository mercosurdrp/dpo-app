import { redirect } from "next/navigation"
import {
  getReunionDetalle,
  getIndicadoresMes,
  listResponsablesPosibles,
  puedeEditarReuniones,
} from "@/actions/reuniones"
import { getSectoresAlmacen, getVehiculosActivos } from "@/actions/s5"
import { listarRubrosMantenimiento } from "@/actions/mantenimiento-edilicio"
import { getProfile } from "@/lib/session"
import { ReunionDetallePageClient } from "./reunion-detalle-page-client"

// getIndicadoresMes (logística Misiones) trae en vivo el manifiesto de carga
// del día (waypoints + deliveries de cada ruta iniciada, ~8s) además de Chess,
// TML, ausentismo y Analía. Damos margen para que no corte por timeout.
export const maxDuration = 60

export default async function ReunionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [
    profile,
    detalleRes,
    indicadoresMesRes,
    respRes,
    puedeEditar,
    sectoresRes,
    vehiculosRes,
    rubrosRes,
  ] = await Promise.all([
    getProfile(),
    getReunionDetalle(id),
    getIndicadoresMes(id),
    listResponsablesPosibles(),
    puedeEditarReuniones(),
    getSectoresAlmacen(),
    getVehiculosActivos(),
    listarRubrosMantenimiento(),
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
      sectoresAlmacen={"data" in sectoresRes ? sectoresRes.data : []}
      vehiculos={"data" in vehiculosRes ? vehiculosRes.data : []}
      rubrosMantenimiento={rubrosRes.data ?? []}
      puedeEditar={puedeEditar}
      currentProfileId={profile.id}
      currentRole={profile.role}
    />
  )
}

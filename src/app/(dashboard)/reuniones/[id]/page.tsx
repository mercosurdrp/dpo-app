import { redirect } from "next/navigation"
import {
  getReunionDetalle,
  getIndicadoresMes,
  listResponsablesPosibles,
  puedeEditarReuniones,
} from "@/actions/reuniones"
import { getSectoresAlmacen, getVehiculosActivos } from "@/actions/s5"
import { listarRubrosMantenimiento } from "@/actions/mantenimiento-edilicio"
import { listIniciativas } from "@/actions/presupuesto-iniciativas"
import { listResponsablesPosibles as listResponsablesPresupuesto } from "@/actions/presupuesto"
import { getEjecucionPorRubro } from "@/actions/presupuesto-generador"
import { getKpiPerdidas } from "@/actions/presupuesto-perdidas-kpi"
import { getKpiCombustible } from "@/actions/presupuesto-combustible-kpi"
import {
  anioIniciativasDe,
  type IniciativasAhorroReunionData,
} from "@/lib/reuniones-iniciativas-ahorro"
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

  // Reunión de Iniciativas de Ahorro: su temario son las iniciativas del año
  // con el mismo bloque de /presupuesto, así que se leen acá (server) las
  // mismas cuatro cosas que lee esa página. Depende del tipo, por eso va
  // después del detalle y no en el Promise.all de arriba.
  let iniciativasAhorro: IniciativasAhorroReunionData | null = null
  if ("data" in detalleRes && detalleRes.data.tipo === "iniciativas-ahorro") {
    const anio = anioIniciativasDe(detalleRes.data.fecha)
    const [iniRes, ejecRes, perdRes, combRes, respPresRes] = await Promise.all([
      listIniciativas(anio),
      getEjecucionPorRubro(anio),
      getKpiPerdidas(anio),
      getKpiCombustible(anio),
      listResponsablesPresupuesto(),
    ])
    iniciativasAhorro = {
      anio,
      iniciativas: "data" in iniRes ? iniRes.data : [],
      ejecucionRubros: "data" in ejecRes ? ejecRes.data : {},
      kpiPerdidas: "data" in perdRes ? perdRes.data : {},
      kpiCombustible: "data" in combRes ? combRes.data : {},
      responsables: "data" in respPresRes ? respPresRes.data : [],
    }
  }

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
      iniciativasAhorro={iniciativasAhorro}
      puedeEditar={puedeEditar}
      currentProfileId={profile.id}
      currentRole={profile.role}
    />
  )
}

import {
  getAniosDisponibles,
  getEerrAnual,
  getPresupuestoAnual,
  listResponsablesPosibles,
  listTareas,
  puedeEditarPresupuesto,
} from "@/actions/presupuesto"
import { getProfile } from "@/lib/session"
import { PresupuestoClient } from "./presupuesto-client"

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>
}) {
  const sp = await searchParams

  const [profile, aniosRes] = await Promise.all([
    getProfile(),
    getAniosDisponibles(),
  ])

  if ("error" in aniosRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Presupuesto</h1>
        <p className="mt-2 text-red-500">Error: {aniosRes.error}</p>
      </div>
    )
  }

  const aniosDisponibles = aniosRes.data
  const anioActualSistema = new Date().getFullYear()

  // Resolver año activo: query param > año actual si está en disponibles >
  // último año disponible > año actual
  let anioActivo = anioActualSistema
  const anioParam = sp.anio ? parseInt(sp.anio, 10) : NaN
  if (!Number.isNaN(anioParam) && anioParam >= 2000 && anioParam <= 2100) {
    anioActivo = anioParam
  } else if (aniosDisponibles.length > 0) {
    if (aniosDisponibles.includes(anioActualSistema)) {
      anioActivo = anioActualSistema
    } else {
      anioActivo = aniosDisponibles[0]
    }
  }

  const [
    anualRes,
    eerrRes,
    tareasRes,
    responsablesRes,
    puedeEditar,
  ] = await Promise.all([
    getPresupuestoAnual(anioActivo),
    getEerrAnual(anioActivo),
    listTareas(anioActivo),
    listResponsablesPosibles(),
    puedeEditarPresupuesto(),
  ])

  if ("error" in tareasRes) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Presupuesto</h1>
        <p className="mt-2 text-red-500">Error: {tareasRes.error}</p>
      </div>
    )
  }

  return (
    <PresupuestoClient
      aniosDisponibles={aniosDisponibles}
      anioActivo={anioActivo}
      anual={"data" in anualRes ? anualRes.data : null}
      eerr={"data" in eerrRes ? eerrRes.data : null}
      tareas={tareasRes.data}
      responsables={"data" in responsablesRes ? responsablesRes.data : []}
      puedeEditar={puedeEditar}
      currentProfileId={profile?.id ?? null}
    />
  )
}

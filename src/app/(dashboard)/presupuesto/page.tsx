import {
  getAniosDisponibles,
  getEerrAnual,
  getPresupuestoAnual,
  listResponsablesPosibles,
  listTareas,
  puedeEditarPresupuesto,
} from "@/actions/presupuesto"
import { listIniciativas } from "@/actions/presupuesto-iniciativas"
import {
  getEjecucionPorRubro,
  type EjecucionRubro,
} from "@/actions/presupuesto-generador"
import {
  getKpiPerdidas,
  type KpiPerdidas,
} from "@/actions/presupuesto-perdidas-kpi"
import {
  getKpiCombustible,
  type KpiCombustible,
} from "@/actions/presupuesto-combustible-kpi"
import { listPlanesAccion } from "@/actions/presupuesto-planes-accion"
import { listInversiones } from "@/actions/presupuesto-inversiones"
import { getProfile } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import type {
  IniciativaAhorroConDetalle,
  InversionConDetalle,
  PlanAccionPresupuestoConDetalle,
} from "@/types/database"
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

  const mostrarIniciativas = !IS_MISIONES
  const mostrarPlanesAccion = !IS_MISIONES
  const mostrarInversiones = !IS_MISIONES

  const [
    anualRes,
    eerrRes,
    tareasRes,
    responsablesRes,
    puedeEditar,
    iniciativasRes,
    planesAccionRes,
    inversionesRes,
    ejecucionRes,
    kpiPerdidasRes,
    kpiCombustibleRes,
  ] = await Promise.all([
    getPresupuestoAnual(anioActivo),
    getEerrAnual(anioActivo),
    listTareas(anioActivo),
    listResponsablesPosibles(),
    puedeEditarPresupuesto(),
    mostrarIniciativas
      ? listIniciativas(anioActivo)
      : Promise.resolve<{ data: IniciativaAhorroConDetalle[] }>({ data: [] }),
    mostrarPlanesAccion
      ? listPlanesAccion(anioActivo)
      : Promise.resolve<{ data: PlanAccionPresupuestoConDetalle[] }>({ data: [] }),
    mostrarInversiones
      ? listInversiones(anioActivo)
      : Promise.resolve<{ data: InversionConDetalle[] }>({ data: [] }),
    // Ejecución por rubro (EERR): de acá sale el ahorro REAL de las iniciativas
    // que tienen rubro, con la misma vara que su compromiso.
    mostrarIniciativas
      ? getEjecucionPorRubro(anioActivo)
      : Promise.resolve<{ data: Record<string, EjecucionRubro> }>({ data: {} }),
    // KPI físico de las iniciativas del depósito (lo perdido por HL vendido).
    // Pega al tablero de Esteban: si no responde, las tarjetas caen al KPI
    // cargado a mano en vez de romper la página.
    mostrarIniciativas
      ? getKpiPerdidas(anioActivo)
      : Promise.resolve<{ data: Record<string, KpiPerdidas> }>({ data: {} }),
    // KPI físico de las iniciativas de flota (km/l). Sale del registro de
    // combustible propio, así que no depende de servicios externos.
    mostrarIniciativas
      ? getKpiCombustible(anioActivo)
      : Promise.resolve<{ data: Record<string, KpiCombustible> }>({ data: {} }),
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
      mostrarIniciativas={mostrarIniciativas}
      iniciativas={"data" in iniciativasRes ? iniciativasRes.data : []}
      ejecucionRubros={"data" in ejecucionRes ? ejecucionRes.data : {}}
      kpiPerdidas={"data" in kpiPerdidasRes ? kpiPerdidasRes.data : {}}
      kpiCombustible={
        "data" in kpiCombustibleRes ? kpiCombustibleRes.data : {}
      }
      mostrarPlanesAccion={mostrarPlanesAccion}
      planesAccion={"data" in planesAccionRes ? planesAccionRes.data : []}
      mostrarInversiones={mostrarInversiones}
      inversiones={"data" in inversionesRes ? inversionesRes.data : []}
    />
  )
}

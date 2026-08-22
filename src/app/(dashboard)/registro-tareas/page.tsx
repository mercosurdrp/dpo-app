import { requireAuth } from "@/lib/session"
import {
  getRegistroTareasDirectas,
  getOperadoresParaAsignar,
  getPilaresParaFiltro,
  getBloquesParaFiltro,
} from "@/actions/tareas-directas"
import { getSectoresAlmacen, getVehiculosActivos } from "@/actions/s5"
import { listResponsablesPosibles } from "@/actions/s5-acciones"
import { RegistroTareasClient } from "./registro-tareas-client"

export const dynamic = "force-dynamic"

export default async function RegistroTareasPage() {
  const profile = await requireAuth()

  const [
    resultado,
    operadores,
    pilares,
    bloques,
    sectoresRes,
    vehiculosRes,
    responsables5sRes,
  ] = await Promise.all([
    getRegistroTareasDirectas(),
    getOperadoresParaAsignar(),
    getPilaresParaFiltro(),
    getBloquesParaFiltro(),
    getSectoresAlmacen(),
    getVehiculosActivos(),
    listResponsablesPosibles(),
  ])

  if ("error" in resultado) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold">Registro de tareas</h1>
        <p className="mt-2 text-red-500">Error: {resultado.error}</p>
      </div>
    )
  }

  const puedeCrear =
    profile.role === "admin" ||
    profile.role === "auditor" ||
    profile.puede_asignar_tareas === true

  // Crear acciones 5S es más restrictivo que crear tareas directas: la policy
  // s5_acciones_insert sólo deja a admin/auditor.
  const puedeCrear5S = profile.role === "admin" || profile.role === "auditor"

  return (
    <RegistroTareasClient
      tareasIniciales={resultado.data}
      operadores={operadores}
      pilares={pilares}
      bloques={bloques}
      puedeCrear={puedeCrear}
      puedeCrear5S={puedeCrear5S}
      sectoresAlmacen={"error" in sectoresRes ? [] : sectoresRes.data}
      vehiculos={"error" in vehiculosRes ? [] : vehiculosRes.data}
      responsables5s={
        "error" in responsables5sRes ? [] : responsables5sRes.data
      }
    />
  )
}

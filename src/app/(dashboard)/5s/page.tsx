import { getProfile } from "@/lib/session"
import {
  getAuditorias,
  getEmpleadosActivos5S,
  getPeriodoActual,
  getSectoresAlmacen,
  getSectorResponsables,
  getVehiculosActivos,
  getVehiculosPendientesMes,
} from "@/actions/s5"
import type { S5Tipo } from "@/types/database"
import { CincoSClient } from "./cinco-s-client"

export default async function CincoSPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const profile = await getProfile()
  const sp = await searchParams
  const tipoInicial: S5Tipo = sp.tipo === "almacen" ? "almacen" : "flota"

  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">5S</h1>
        <p className="mt-2 text-red-500">No se pudo cargar tu perfil.</p>
      </div>
    )
  }

  const periodoActual = await getPeriodoActual()

  const [
    auditoriasFlota,
    auditoriasAlmacen,
    responsables,
    vehiculosActivos,
    vehiculosPendientes,
    empleados,
    sectoresAlmacen,
  ] = await Promise.all([
    getAuditorias({ tipo: "flota", periodo: periodoActual }),
    getAuditorias({ tipo: "almacen", limit: 500 }),
    getSectorResponsables(periodoActual),
    getVehiculosActivos(),
    getVehiculosPendientesMes(periodoActual),
    getEmpleadosActivos5S(),
    getSectoresAlmacen(),
  ])

  if ("error" in auditoriasFlota) {
    return (
      <div>
        <h1 className="text-2xl font-bold">5S</h1>
        <p className="mt-2 text-red-500">Error: {auditoriasFlota.error}</p>
      </div>
    )
  }
  if ("error" in auditoriasAlmacen) {
    return (
      <div>
        <h1 className="text-2xl font-bold">5S</h1>
        <p className="mt-2 text-red-500">Error: {auditoriasAlmacen.error}</p>
      </div>
    )
  }

  return (
    <CincoSClient
      periodoActual={periodoActual}
      tipoInicial={tipoInicial}
      currentRole={profile.role}
      auditoriasFlota={auditoriasFlota.data}
      auditoriasAlmacen={auditoriasAlmacen.data}
      responsables={"error" in responsables ? [] : responsables.data}
      vehiculosActivos={"error" in vehiculosActivos ? [] : vehiculosActivos.data}
      vehiculosPendientes={
        "error" in vehiculosPendientes ? [] : vehiculosPendientes.data
      }
      empleados={"error" in empleados ? [] : empleados.data}
      sectoresAlmacen={"error" in sectoresAlmacen ? [] : sectoresAlmacen.data}
    />
  )
}

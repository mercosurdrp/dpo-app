import { getProfile } from "@/lib/session"
import {
  getAuditorias,
  getEmpleadosActivos5S,
  getPeriodoActual,
  getSectorResponsables,
  getVehiculosActivos,
  getVehiculosPendientesMes,
} from "@/actions/s5"
import { CincoSClient } from "./cinco-s-client"

export default async function CincoSPage() {
  const profile = await getProfile()

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
  ] = await Promise.all([
    getAuditorias({ tipo: "flota", periodo: periodoActual }),
    getAuditorias({ tipo: "almacen", periodo: periodoActual }),
    getSectorResponsables(periodoActual),
    getVehiculosActivos(),
    getVehiculosPendientesMes(periodoActual),
    getEmpleadosActivos5S(),
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
      currentRole={profile.role}
      auditoriasFlota={auditoriasFlota.data}
      auditoriasAlmacen={auditoriasAlmacen.data}
      responsables={"error" in responsables ? [] : responsables.data}
      vehiculosActivos={"error" in vehiculosActivos ? [] : vehiculosActivos.data}
      vehiculosPendientes={
        "error" in vehiculosPendientes ? [] : vehiculosPendientes.data
      }
      empleados={"error" in empleados ? [] : empleados.data}
    />
  )
}

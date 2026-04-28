import {
  listarMisSolicitudes,
  listarTiposLicencia,
  obtenerSaldoVacaciones,
} from "@/actions/rrhh-licencias"
import { getEmpleadoIdFromAuth, requireAuth } from "@/lib/session"
import { MisSolicitudesClient } from "./mis-solicitudes-client"

export default async function MisSolicitudesPage() {
  await requireAuth()
  const empleadoId = await getEmpleadoIdFromAuth()
  const anio = new Date().getFullYear()

  const [solicitudesRes, tiposRes, saldoRes] = await Promise.all([
    listarMisSolicitudes(),
    listarTiposLicencia(),
    empleadoId
      ? obtenerSaldoVacaciones(empleadoId, anio)
      : Promise.resolve({ data: null }),
  ])

  if (!empleadoId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900">Mis vacaciones</h1>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu usuario no está vinculado a un empleado. Pedile a RRHH que vincule
          tu legajo a tu cuenta web.
        </p>
      </div>
    )
  }

  return (
    <MisSolicitudesClient
      solicitudes={"data" in solicitudesRes ? solicitudesRes.data : []}
      tipos={"data" in tiposRes ? tiposRes.data : []}
      saldo={"data" in saldoRes ? saldoRes.data : null}
      anio={anio}
    />
  )
}

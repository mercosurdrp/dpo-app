import { getMisTalles, listarMisEntregas } from "@/actions/epp"
import { getEmpleadoIdFromAuth, requireAuth } from "@/lib/session"
import { MiRopaClient } from "./mi-ropa-client"

export const dynamic = "force-dynamic"

export default async function MiRopaPage() {
  await requireAuth()
  const empleadoId = await getEmpleadoIdFromAuth()

  if (!empleadoId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-slate-900">Mi ropa</h1>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu usuario no está vinculado a un empleado. Pedile a RRHH que vincule
          tu legajo a tu cuenta web.
        </p>
      </div>
    )
  }

  const [tallesRes, entregasRes] = await Promise.all([
    getMisTalles(),
    listarMisEntregas(),
  ])

  return (
    <MiRopaClient
      talles={"data" in tallesRes ? tallesRes.data : null}
      entregas={"data" in entregasRes ? entregasRes.data : []}
    />
  )
}

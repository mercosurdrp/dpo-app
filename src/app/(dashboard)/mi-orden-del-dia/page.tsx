// Vista del empleado: ve SU asignación del día.
// Antes de las 19hs (hora ARG) muestra HOY; desde las 19hs muestra MAÑANA.

import { requireAuth } from "@/lib/session"
import { obtenerMiOrdenSalida } from "@/actions/orden-salida"
import { fechaQueVeElEmpleado } from "@/lib/orden-salida-fechas"
import { MiOrdenDelDiaCard } from "./mi-orden-del-dia-card"

export const dynamic = "force-dynamic"

export default async function MiOrdenDelDiaPage() {
  await requireAuth()
  const fecha = fechaQueVeElEmpleado()
  const res = await obtenerMiOrdenSalida()

  if ("error" in res) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Mi orden del día</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {res.error}
        </div>
      </div>
    )
  }

  return <MiOrdenDelDiaCard data={res.data} fecha={fecha} />
}

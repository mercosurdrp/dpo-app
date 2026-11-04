import { getAsistenciaEmpleados, getCapacitaciones, getMisCapacitaciones } from "@/actions/capacitaciones"
import { getProfile } from "@/lib/session"
import { CapacitacionesClient } from "./capacitaciones-client"

export default async function CapacitacionesPage() {
  const [result, profile, mias] = await Promise.all([
    getCapacitaciones(),
    getProfile(),
    // Capacitaciones a las que el propio usuario está convocado: la lista le
    // marca cuáles le falta rendir, también a un admin/auditor.
    getMisCapacitaciones(),
  ])

  if ("error" in result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Capacitaciones</h1>
        <p className="mt-2 text-red-500">Error: {result.error}</p>
      </div>
    )
  }

  const canEdit = profile?.role === "admin" || profile?.role === "auditor"

  // La asistencia individual (quién faltó a qué) sólo la ve admin/auditor.
  const asistencia = canEdit ? await getAsistenciaEmpleados() : null
  const porEmpleado = asistencia && !("error" in asistencia) ? asistencia.data : null
  const misPendientes =
    "data" in mias
      ? mias.data.filter((c) => c.asistencia?.resultado === "pendiente").map((c) => c.id)
      : []

  return (
    <CapacitacionesClient
      capacitaciones={result.data}
      canEdit={canEdit}
      asistenciaPorEmpleado={porEmpleado}
      misPendientes={misPendientes}
    />
  )
}

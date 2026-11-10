import { requireRole } from "@/lib/session"
import { getNovedadesTodas } from "@/actions/novedades"
import { NovedadesAdminClient } from "./novedades-admin-client"

export default async function NovedadesPage() {
  await requireRole(["admin", "supervisor"])
  const res = await getNovedadesTodas()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Novedades</h1>
        <p className="text-sm text-muted-foreground">
          Cartelera que ven todos los empleados arriba de todo en su Inicio: cumpleaños, feriados, comunicados.
        </p>
      </div>
      {"error" in res ? (
        <p className="text-red-500">Error: {res.error}</p>
      ) : (
        <NovedadesAdminClient novedades={res.data} />
      )}
    </div>
  )
}

import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import {
  getVisibilidadEmpleado,
  getVisibilidadEquipo,
} from "@/actions/visibilidad-resultados"
import { VisibilidadEmpleadoClient } from "./visibilidad-empleado-client"
import { VisibilidadEquipoClient } from "./visibilidad-equipo-client"

// Visibilidad de Resultados (DPO Entrega 2.1) — solo Pampeana.
// Rol empleado → SUS resultados (R2.1.4); supervisor/admin/admin_rrhh/auditor
// → tablero del equipo. viewer queda afuera (dato sensible).

export const dynamic = "force-dynamic"

export default async function VisibilidadResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  if (IS_MISIONES) notFound()
  const profile = await requireAuth()
  const { mes } = await searchParams

  if (profile.role === "empleado") {
    const res = await getVisibilidadEmpleado(mes)
    if ("error" in res) {
      return <MensajeError mensaje={res.error} />
    }
    return <VisibilidadEmpleadoClient data={res.data} />
  }

  if (["admin", "supervisor", "admin_rrhh", "auditor"].includes(profile.role)) {
    const res = await getVisibilidadEquipo(mes)
    if ("error" in res) {
      return <MensajeError mensaje={res.error} />
    }
    return <VisibilidadEquipoClient data={res.data} />
  }

  // viewer u otros roles: sin acceso.
  notFound()
}

function MensajeError({ mensaje }: { mensaje: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-lg font-semibold text-slate-800">Visibilidad de Resultados</p>
      <p className="mt-2 text-sm text-muted-foreground">{mensaje}</p>
    </div>
  )
}

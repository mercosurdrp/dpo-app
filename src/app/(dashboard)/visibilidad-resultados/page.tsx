import { notFound, redirect } from "next/navigation"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { requireAuth } from "@/lib/session"
import { getVisibilidadEquipo } from "@/actions/visibilidad-resultados"
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
  await requireModuloPortal("mis-resultados")
  const profile = await requireAuth()
  const { mes } = await searchParams

  // El empleado lo ve como solapa de «Cómo venimos»; esta ruta queda por los links viejos.
  if (profile.role === "empleado") {
    redirect(mes ? `/como-venimos?tab=horas&mes=${encodeURIComponent(mes)}` : "/como-venimos?tab=horas")
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

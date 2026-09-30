import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getClasificacionDelDia } from "@/actions/clasificacion-envases"
import { ClasificacionEnvasesClient } from "./clasificacion-envases-client"

export const dynamic = "force-dynamic"

export default async function ClasificacionEnvasesPage() {
  await requireAuth()
  await requireModuloPortal("envases")

  const res = await getClasificacionDelDia()
  return (
    <ClasificacionEnvasesClient
      inicial={"data" in res ? res.data : null}
      errorInicial={"error" in res ? res.error : null}
    />
  )
}

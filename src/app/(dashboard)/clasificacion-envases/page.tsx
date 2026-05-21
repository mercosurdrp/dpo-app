import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getClasificacionDelDia } from "@/actions/clasificacion-envases"
import { ClasificacionEnvasesClient } from "./clasificacion-envases-client"

export const dynamic = "force-dynamic"

export default async function ClasificacionEnvasesPage() {
  await requireAuth()
  // Feature exclusiva de Pampeana (Depósito Esteban).
  if (IS_MISIONES) redirect("/")

  const res = await getClasificacionDelDia()
  return (
    <ClasificacionEnvasesClient
      inicial={"data" in res ? res.data : null}
      errorInicial={"error" in res ? res.error : null}
    />
  )
}

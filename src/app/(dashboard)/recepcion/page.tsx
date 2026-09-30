import { redirect } from "next/navigation"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { requireAuth } from "@/lib/session"
import { puedeOperarAcarreo, puedeDarIngreso } from "@/lib/acarreo-operadores"
import { getPendientesAcarreo } from "@/actions/acarreo"
import { RecepcionClient } from "./recepcion-client"

export const dynamic = "force-dynamic"

export default async function RecepcionPage() {
  const profile = await requireAuth()
  await requireModuloPortal("recepcion")
  if (!puedeOperarAcarreo(profile.role, profile.email)) redirect("/")

  const r = await getPendientesAcarreo()
  return (
    <RecepcionClient
      inicial={"data" in r ? r.data : []}
      errorInicial={"error" in r ? r.error : null}
      esAdmin={profile.role === "admin"}
      puedeIngreso={puedeDarIngreso(profile.role, profile.email)}
    />
  )
}

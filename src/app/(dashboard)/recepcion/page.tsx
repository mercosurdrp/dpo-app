import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { puedeOperarAcarreo } from "@/lib/acarreo-operadores"
import { getPendientesAcarreo } from "@/actions/acarreo"
import { RecepcionClient } from "./recepcion-client"

export const dynamic = "force-dynamic"

export default async function RecepcionPage() {
  const profile = await requireAuth()
  if (IS_MISIONES) redirect("/")
  if (!puedeOperarAcarreo(profile.role, profile.email)) redirect("/")

  const r = await getPendientesAcarreo()
  return (
    <RecepcionClient
      inicial={"data" in r ? r.data : []}
      errorInicial={"error" in r ? r.error : null}
      esAdmin={profile.role === "admin"}
    />
  )
}

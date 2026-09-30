import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getMisIdeas } from "@/actions/buenas-practicas"
import { MisBuenasPracticasClient } from "./mis-buenas-practicas-client"

export const dynamic = "force-dynamic"

export default async function MisBuenasPracticasPage() {
  await requireAuth()
  await requireModuloPortal("buenas-practicas")

  const res = await getMisIdeas()
  const ideas = "error" in res ? [] : res.data

  return <MisBuenasPracticasClient ideas={ideas} />
}

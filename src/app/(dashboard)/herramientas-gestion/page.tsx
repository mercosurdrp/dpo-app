import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { redirect } from "next/navigation"
import { listarHerramientasGestion } from "@/actions/herramientas-gestion"
import { HerramientasGestionClient } from "./herramientas-gestion-client"

export default async function HerramientasGestionPage() {
  await requireAuth()
  if (IS_MISIONES) redirect("/")
  const r = await listarHerramientasGestion()
  const items = "data" in r ? r.data : []
  return <HerramientasGestionClient items={items} />
}

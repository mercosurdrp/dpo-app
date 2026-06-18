import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getMisIdeas } from "@/actions/buenas-practicas"
import { MisBuenasPracticasClient } from "./mis-buenas-practicas-client"

export const dynamic = "force-dynamic"

export default async function MisBuenasPracticasPage() {
  await requireAuth()
  if (IS_MISIONES) redirect("/")

  const res = await getMisIdeas()
  const ideas = "error" in res ? [] : res.data

  return <MisBuenasPracticasClient ideas={ideas} />
}

import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { PlanTerritorialClient } from "./plan-territorial-client"

export const dynamic = "force-dynamic"

export default async function PlanTerritorialPage() {
  if (!IS_MISIONES) notFound()
  await requireAuth()
  return <PlanTerritorialClient />
}

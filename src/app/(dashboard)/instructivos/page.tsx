import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { InstructivosClient } from "./instructivos-client"

export const metadata = {
  title: "Cómo se hace | Instructivos del depósito",
}

export default async function InstructivosPage() {
  await requireAuth()
  // Los instructivos son los del depósito de Pampeana (canchas, metas y
  // ventana de recepción propias). Misiones tiene su propia operación.
  if (IS_MISIONES) redirect("/")

  return <InstructivosClient />
}

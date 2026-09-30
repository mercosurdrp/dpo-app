import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { InstructivosClient } from "./instructivos-client"

export const metadata = {
  title: "Cómo se hace | Instructivos del depósito",
}

export default async function InstructivosPage() {
  await requireAuth()
  await requireModuloPortal("instructivos")

  return <InstructivosClient />
}

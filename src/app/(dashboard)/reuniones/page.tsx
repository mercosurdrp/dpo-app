import { requireAuth } from "@/lib/session"
import { ReunionesClient } from "./reuniones-client"

export default async function ReunionesPage() {
  await requireAuth()
  return <ReunionesClient />
}

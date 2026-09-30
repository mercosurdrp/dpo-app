import { requireAuth } from "@/lib/session"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { getMiFeedback } from "@/actions/feedback-empleados"
import { MiFeedbackClient } from "./mi-feedback-client"

export const dynamic = "force-dynamic"

export default async function MiFeedbackPage() {
  await requireModuloPortal("feedback")

  await requireAuth()
  const res = await getMiFeedback()
  const feedback = "data" in res ? res.data : []

  return <MiFeedbackClient feedback={feedback} />
}

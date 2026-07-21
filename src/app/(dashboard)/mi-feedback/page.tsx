import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getMiFeedback } from "@/actions/feedback-empleados"
import { MiFeedbackClient } from "./mi-feedback-client"

export const dynamic = "force-dynamic"

export default async function MiFeedbackPage() {
  // Igual que el resto del portal del empleado de Pampeana.
  if (IS_MISIONES) redirect("/")

  await requireAuth()
  const res = await getMiFeedback()
  const feedback = "data" in res ? res.data : []

  return <MiFeedbackClient feedback={feedback} />
}

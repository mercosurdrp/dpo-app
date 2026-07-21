import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getFeedbackGestion, getFeedbackResumen } from "@/actions/feedback-empleados"
import { FeedbackGestionClient } from "./feedback-gestion-client"

export const dynamic = "force-dynamic"

export default async function FeedbackEmpleadosPage() {
  if (IS_MISIONES) redirect("/")

  const profile = await requireAuth()
  if (!["admin", "supervisor", "admin_rrhh"].includes(profile.role)) redirect("/")

  const [lista, resumen] = await Promise.all([getFeedbackGestion(), getFeedbackResumen()])

  return (
    <FeedbackGestionClient
      feedback={"data" in lista ? lista.data : []}
      resumen={
        "data" in resumen
          ? resumen.data
          : { total: 0, nuevos: 0, tratados: 0, con_accion: 0, cerrados: 0 }
      }
      currentRole={profile.role}
    />
  )
}

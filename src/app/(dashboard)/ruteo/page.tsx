import { redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getRuteoDelDia, listarRuteoHistorial } from "@/actions/ruteo"
import { RuteoClient } from "./ruteo-client"

export const dynamic = "force-dynamic"

export default async function RuteoPage() {
  await requireRole(["admin", "supervisor"])
  // Feature exclusiva de Pampeana (ciudades Pergamino / Ramallo).
  if (IS_MISIONES) redirect("/")

  const [dia, historial] = await Promise.all([
    getRuteoDelDia(),
    listarRuteoHistorial(),
  ])

  return (
    <RuteoClient
      diaInicial={"data" in dia ? dia.data : null}
      historialInicial={"data" in historial ? historial.data : []}
      errorInicial={"error" in dia ? dia.error : null}
    />
  )
}

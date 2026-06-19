import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { MantenimientoInstalacionesClient } from "./mantenimiento-instalaciones-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Mantenimiento de Instalaciones (2.4)" }

// DPO Planeamiento 2.4 · Mantenimiento de Instalaciones (Facility Maintenance).
// Port nativo de la app FastAPI "Plan de Mantenimiento Edilicio". Solo Misiones.
export default async function MantenimientoInstalacionesPage() {
  if (!IS_MISIONES) notFound()
  await requireAuth()
  return <MantenimientoInstalacionesClient />
}

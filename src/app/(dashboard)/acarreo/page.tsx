import { redirect } from "next/navigation"
import { requireRole } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getRecepcionesAcarreo } from "@/actions/acarreo"
import { AcarreoClient } from "./acarreo-client"

export const dynamic = "force-dynamic"

function rangoMesActualARG(): { desde: string; hasta: string; year: number; month: number } {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const desde = `${year}-${String(month).padStart(2, "0")}-01`
  const hasta = now.toISOString().slice(0, 10)
  return { desde, hasta, year, month }
}

export default async function AcarreoPage() {
  await requireRole(["admin", "supervisor"])
  // Feature exclusiva de Pampeana (lee la Supabase de acarreo-rdf).
  if (IS_MISIONES) redirect("/")

  const { desde, hasta, year, month } = rangoMesActualARG()
  const r = await getRecepcionesAcarreo(desde, hasta)

  return (
    <AcarreoClient
      inicial={"data" in r ? r.data : []}
      errorInicial={"error" in r ? r.error : null}
      yearInicial={year}
      monthInicial={month}
    />
  )
}

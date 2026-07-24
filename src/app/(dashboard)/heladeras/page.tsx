import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getMovimientosHeladera } from "@/actions/heladeras"
import { HeladerasGestionClient } from "./heladeras-gestion-client"

export const dynamic = "force-dynamic"

const ROLES_PERMITIDOS = ["admin", "supervisor", "admin_rrhh", "auditor"]

function primerDiaDelMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

export default async function HeladerasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  if (IS_MISIONES) redirect("/")

  const profile = await requireAuth()
  if (!ROLES_PERMITIDOS.includes(profile.role)) redirect("/")

  const params = await searchParams
  const desde = params.desde ?? primerDiaDelMes()
  const hasta = params.hasta ?? hoyISO()

  const res = await getMovimientosHeladera(desde, hasta)

  return (
    <HeladerasGestionClient
      movimientos={"data" in res ? res.data : []}
      desde={desde}
      hasta={hasta}
      puedeRevisar={["admin", "supervisor", "admin_rrhh"].includes(profile.role)}
    />
  )
}

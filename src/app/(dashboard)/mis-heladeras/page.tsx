import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getMisMovimientosHeladera } from "@/actions/heladeras"
import { MisHeladerasClient } from "./mis-heladeras-client"

export const dynamic = "force-dynamic"

export default async function MisHeladerasPage() {
  // Módulo exclusivo de Pampeana (igual que /mis-roturas).
  if (IS_MISIONES) redirect("/")

  await requireAuth()
  const supabase = await createClient()

  const [{ data: vehiculos }, movsRes] = await Promise.all([
    supabase
      .from("catalogo_vehiculos")
      .select("dominio, sector, active")
      .eq("active", true)
      .order("sector", { ascending: true })
      .order("dominio", { ascending: true }),
    getMisMovimientosHeladera(),
  ])

  const patentes = ((vehiculos ?? []) as { dominio: string }[])
    .map((v) => v.dominio)
    .filter(Boolean)

  const movimientos = "data" in movsRes ? movsRes.data : []

  return <MisHeladerasClient patentes={patentes} movimientos={movimientos} />
}

import { createClient } from "@/lib/supabase/server"
import { requireModuloPortal } from "@/lib/portal-empleado-server"
import { requireAuth } from "@/lib/session"
import { getMisRoturas } from "@/actions/roturas-calle"
import { MisRoturasClient } from "./mis-roturas-client"

export const dynamic = "force-dynamic"

export default async function MisRoturasPage() {
  await requireModuloPortal("roturas")

  await requireAuth()
  const supabase = await createClient()

  const [{ data: vehiculos }, roturasRes] = await Promise.all([
    supabase
      .from("catalogo_vehiculos")
      .select("dominio, sector, active")
      .eq("active", true)
      .order("sector", { ascending: true })
      .order("dominio", { ascending: true }),
    getMisRoturas(),
  ])

  const patentes = ((vehiculos ?? []) as { dominio: string }[])
    .map((v) => v.dominio)
    .filter(Boolean)

  const roturas = "data" in roturasRes ? roturasRes.data : []

  return <MisRoturasClient patentes={patentes} roturas={roturas} />
}

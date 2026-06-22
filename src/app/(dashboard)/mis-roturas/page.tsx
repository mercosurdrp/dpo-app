import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { getMisRoturas } from "@/actions/roturas-calle"
import type { RoturaSkuOption } from "@/types/roturas"
import { MisRoturasClient } from "./mis-roturas-client"

export const dynamic = "force-dynamic"

export default async function MisRoturasPage() {
  // Módulo exclusivo de Pampeana (igual que el DQI).
  if (IS_MISIONES) redirect("/")

  await requireAuth()
  const supabase = await createClient()

  const [{ data: vehiculos }, { data: articulos }, roturasRes] = await Promise.all([
    supabase
      .from("catalogo_vehiculos")
      .select("dominio, sector, active")
      .eq("active", true)
      .order("sector", { ascending: true })
      .order("dominio", { ascending: true }),
    supabase
      .from("chess_articulos")
      .select("id_articulo, des_articulo")
      .eq("anulado", false)
      .order("des_articulo", { ascending: true }),
    getMisRoturas(),
  ])

  const patentes = ((vehiculos ?? []) as { dominio: string }[])
    .map((v) => v.dominio)
    .filter(Boolean)

  const skus: RoturaSkuOption[] = ((articulos ?? []) as {
    id_articulo: number
    des_articulo: string | null
  }[])
    .filter((a) => a.des_articulo)
    .map((a) => ({ id_articulo: a.id_articulo, des_articulo: a.des_articulo as string }))

  const roturas = "data" in roturasRes ? roturasRes.data : []

  return <MisRoturasClient patentes={patentes} skus={skus} roturas={roturas} />
}

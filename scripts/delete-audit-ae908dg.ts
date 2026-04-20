import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const { data: veh } = await supabase
    .from("catalogo_vehiculos")
    .select("id, dominio")
    .eq("dominio", "AE908DG")
    .maybeSingle()

  if (!veh) {
    console.log("✗ vehículo AE908DG no encontrado")
    return
  }
  console.log(`✓ vehículo ${veh.dominio} (${veh.id})`)

  const { data: audits } = await supabase
    .from("s5_auditorias")
    .select("id, fecha, nota_total, estado")
    .eq("fecha", "2026-04-17")
    .eq("vehiculo_id", veh.id)

  console.log(`Encontradas ${audits?.length ?? 0} auditorías del 17/04/2026:`)
  for (const a of audits ?? []) {
    console.log(`  ${a.id} - ${a.fecha} - ${a.estado} - ${a.nota_total}%`)
  }

  for (const a of audits ?? []) {
    const { error: e1 } = await supabase
      .from("s5_auditoria_items")
      .delete()
      .eq("auditoria_id", a.id)
    if (e1) console.log("  ✗ items:", e1.message)

    const { error: e2 } = await supabase
      .from("s5_auditorias")
      .delete()
      .eq("id", a.id)
    if (e2) console.log("  ✗ auditoría:", e2.message)
    else console.log(`  ✓ eliminada ${a.id}`)
  }
}

main().catch(console.error)

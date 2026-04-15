import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: rutas } = await supabase
    .from("foxtrot_routes")
    .select("*")
    .eq("fecha", hoy)
    .order("driver_name")
  console.log(`\n=== Rutas del ${hoy} (${rutas?.length ?? 0}) ===`)
  for (const r of rutas || []) {
    const tiempo = r.tiempo_ruta_minutos != null
      ? `${Math.floor(r.tiempo_ruta_minutos / 60)}h ${r.tiempo_ruta_minutos % 60}m`
      : "en curso"
    console.log(
      `  ${r.driver_name.padEnd(22)} · ` +
      `DC ${r.dc_id.padEnd(10)} · ` +
      `${r.total_deliveries.toString().padStart(3)} deliveries ` +
      `(${r.deliveries_successful} OK / ${r.deliveries_failed} FAIL / ${r.deliveries_visit_later} LATER) · ` +
      `tiempo: ${tiempo} · ` +
      `tracking: ${r.pct_tracking_activo ?? "—"}% · ` +
      `${r.is_finalized ? "finalizada" : "activa"}`
    )
  }

  const { data: locs } = await supabase
    .from("foxtrot_driver_locations")
    .select("*")
    .eq("fecha", hoy)
    .order("timestamp", { ascending: false })
    .limit(20)
  console.log(`\n=== Últimas posiciones GPS (${locs?.length ?? 0}) ===`)
  for (const l of locs || []) {
    const hora = new Date(l.timestamp).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    console.log(`  ${l.driver_name.padEnd(22)} · ${hora} · (${l.latitud.toFixed(4)}, ${l.longitud.toFixed(4)})`)
  }
}
main().catch(console.error)

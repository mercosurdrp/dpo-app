import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  for (const tbl of ["foxtrot_waypoints_visita", "foxtrot_delivery_attempts"]) {
    const { error, count } = await supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
    console.log(`${tbl}: ${error ? "ERROR " + error.message : "OK (" + count + " filas)"}`)
  }
}
main().catch(console.error)

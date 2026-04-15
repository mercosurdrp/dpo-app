import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data } = await supabase
    .from("foxtrot_routes")
    .select("route_id,driver_name,start_time,end_time,completion_type,is_active,is_finalized,tiempo_ruta_minutos")
    .order("driver_name")
  for (const r of data || []) {
    console.log(JSON.stringify(r, null, 2))
  }
}
main().catch(console.error)

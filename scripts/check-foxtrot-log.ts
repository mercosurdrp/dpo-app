import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data } = await supabase
    .from("foxtrot_sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5)
  console.log("Últimos logs:")
  for (const l of data || []) {
    console.log(JSON.stringify(l, null, 2))
  }
}
main().catch(console.error)

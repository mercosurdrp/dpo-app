import { createClient } from "@supabase/supabase-js"
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } })
async function main() {
  const { data, error } = await sb.rpc("pg_policies_for_table" as never, { table_name: "planes_accion" as never } as never)
  if (error) {
    // fallback: query directa
    const { data: pols } = await sb.from("pg_policies" as never).select("*").eq("tablename", "planes_accion")
    console.log(JSON.stringify(pols, null, 2))
    return
  }
  console.log(JSON.stringify(data, null, 2))
}
main().catch(console.error)

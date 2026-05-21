/**
 * Backfill de ROUTE_ANALYTICS (departure real + paradas autorizadas + clientes
 * visitados) a foxtrot_routes.raw_data.
 * Usage: npx tsx scripts/sync-foxtrot-analytics.ts <fromDate> <toDate>
 */
import { createClient } from "@supabase/supabase-js"
import { syncFoxtrotRouteAnalytics } from "../src/lib/foxtrot-analytics"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !process.env.FOXTROT_API_KEY) {
  console.error("Faltan env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FOXTROT_API_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const from = process.argv[2] ?? new Date().toISOString().slice(0, 10)
  const to = process.argv[3] ?? from
  console.log(`Foxtrot analytics ${from} → ${to}`)
  const res = await syncFoxtrotRouteAnalytics(supabase, from, to)
  console.log(JSON.stringify(res, null, 2))
  process.exit(res.ok ? 0 : 1)
}
main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})

/**
 * Standalone Foxtrot sync CLI.
 * Usage: npx tsx scripts/sync-foxtrot.ts [YYYY-MM-DD]
 */

import { createClient } from "@supabase/supabase-js"
import { syncFoxtrotDay } from "../src/lib/foxtrot-sync"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

if (!process.env.FOXTROT_API_KEY) {
  console.warn("⚠ FOXTROT_API_KEY no está configurada — el sync fallará gracefully")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const fecha = process.argv[2] ?? new Date().toISOString().slice(0, 10)
  console.log(`Foxtrot sync para fecha: ${fecha}`)

  const log = await syncFoxtrotDay(supabase, fecha)

  console.log("\n--- Resultado ---")
  console.log(`ok:                      ${log.ok}`)
  console.log(`rutas_sincronizadas:     ${log.rutas_sincronizadas}`)
  console.log(`posiciones_sincronizadas: ${log.posiciones_sincronizadas}`)
  console.log(`errores:                 ${log.errores}`)
  if (log.error_detalle) console.log(`error_detalle:           ${log.error_detalle}`)
  console.log(`finished_at:             ${log.finished_at}`)

  process.exit(log.ok ? 0 : 1)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})

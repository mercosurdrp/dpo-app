/**
 * Script local que corre el mismo sync que el endpoint `/api/rechazos/sync`
 * pero sin pasar por Vercel. Usa la lógica compartida en
 * `src/lib/sync/rechazos-sync.ts` — una sola fuente de verdad.
 *
 * Pre-requisitos: `.env.local` apuntando al tenant correcto, con
 * SUPABASE_SERVICE_ROLE_KEY + CHESS_API_*.
 *
 * Uso:
 *   npx tsx scripts/maintenance/sync-rechazos-local.ts test 2026-04-29
 *   npx tsx scripts/maintenance/sync-rechazos-local.ts backfill 2026-03-01 2026-05-11
 *   npx tsx scripts/maintenance/sync-rechazos-local.ts backfill 2026-05-09 2026-05-09
 *
 * Inserta una fila en `sync_log` al final con source='script'.
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import {
  chessLogin,
  loadMapeoManualChofer,
  syncRechazosForDate,
  type ChessCredentials,
  type SyncDayResult,
} from "../../src/lib/sync/rechazos-sync"

// ---- Cargar .env.local manualmente (tsx no hace dotenv) ----
const env: Record<string, string> = {}
for (const line of readFileSync("/root/dpo-app/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/)
  if (m) env[m[1]] = m[2]
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SVC) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const chess: ChessCredentials = {
  baseUrl: env.CHESS_API_BASE_URL,
  user: env.CHESS_API_USER,
  pass: env.CHESS_API_PASS,
}

const supabase = createClient(SUPABASE_URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function logDay(r: SyncDayResult) {
  if (r.sin_datos) { console.log(`${r.fecha}: sin datos`); return }
  const tag = `R=${r.rechazos_upserted}/${r.total_rechazos_intentados} V=${r.ventas_diarias_upserted}`
  const cho = `[chofer map=${r.chofer.mapeo} sin=${r.chofer.sin_resolver}]`
  const err = r.errors.length ? ` ERR(${r.errors.length}: ${r.errors[0].message})` : ""
  console.log(`${r.fecha}: ${tag} ${cho}${err}`)
}

async function setup() {
  console.log(`Supabase: ${SUPABASE_URL}`)
  console.log(`Chess:    ${chess.baseUrl} (user ${chess.user})`)
  console.log()

  const sessionId = await chessLogin(chess)
  console.log("Chess login OK")
  const mapeoManualChofer = await loadMapeoManualChofer(supabase)
  console.log(`mapeo_patente_chofer manual: ${mapeoManualChofer.size}`)
  console.log()
  return { sessionId, mapeoManualChofer }
}

async function modeTest(fecha: string) {
  const { sessionId, mapeoManualChofer } = await setup()

  const { count: rB } = await supabase.from("rechazos").select("*", { count: "exact", head: true }).eq("fecha", fecha)
  const { count: vB } = await supabase.from("ventas_diarias").select("*", { count: "exact", head: true }).eq("fecha", fecha)
  const { data: sB } = await supabase.from("rechazos").select("created_at").eq("fecha", fecha).order("created_at", { ascending: true }).limit(1)
  console.log(`ANTES — rechazos[${fecha}]: ${rB}, ventas_diarias[${fecha}]: ${vB}`)
  console.log(`ANTES — first created_at: ${sB?.[0]?.created_at ?? "(none)"}`)
  console.log()

  const r = await syncRechazosForDate(fecha, { supabase, chess, sessionId, mapeoManualChofer })
  console.log(`SYNC: ${JSON.stringify(r)}`)
  console.log()

  const { count: rA } = await supabase.from("rechazos").select("*", { count: "exact", head: true }).eq("fecha", fecha)
  const { count: vA } = await supabase.from("ventas_diarias").select("*", { count: "exact", head: true }).eq("fecha", fecha)
  const { data: sA } = await supabase.from("rechazos").select("created_at").eq("fecha", fecha).order("created_at", { ascending: true }).limit(1)
  console.log(`DESPUÉS — rechazos[${fecha}]: ${rA}, ventas_diarias[${fecha}]: ${vA}`)
  console.log(`DESPUÉS — first created_at: ${sA?.[0]?.created_at ?? "(none)"}`)
  console.log()
  console.log(`IDEMPOTENCIA: ${rB === rA && vB === vA ? "✓ OK" : "✗ FALLA"}`)
  console.log(`created_at preservado: ${sB?.[0]?.created_at === sA?.[0]?.created_at ? "✓ SÍ" : "✗ NO (rotó!)"}`)
}

async function modeBackfill(fromStr: string, toStr: string) {
  const startedAt = Date.now()
  const { sessionId, mapeoManualChofer } = await setup()

  const from = new Date(fromStr + "T00:00:00Z")
  const to = new Date(toStr + "T00:00:00Z")
  let totalR = 0, totalV = 0
  let chMap = 0, chSin = 0
  const errors: SyncDayResult["errors"] = []

  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const f = d.toISOString().slice(0, 10)
    try {
      const r = await syncRechazosForDate(f, { supabase, chess, sessionId, mapeoManualChofer })
      logDay(r)
      totalR += r.rechazos_upserted
      totalV += r.ventas_diarias_upserted
      chMap += r.chofer.mapeo; chSin += r.chofer.sin_resolver
      errors.push(...r.errors)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`${f}: FATAL ${msg}`)
      errors.push({ day: f, kind: "rechazo", message: msg })
    }
  }
  const durationMs = Date.now() - startedAt

  console.log()
  console.log(`=== RESUMEN ===`)
  console.log(`Rechazos upserted:        ${totalR}`)
  console.log(`Ventas_diarias upserted:  ${totalV}`)
  console.log(`Chofer mapeo/sin_resolver:${chMap}/${chSin}`)
  console.log(`Errores:                  ${errors.length}`)
  console.log(`Duración:                 ${(durationMs / 1000).toFixed(1)}s`)

  const { error: logErr } = await supabase.from("sync_log").insert({
    source: "script",
    date_from: fromStr,
    date_to: toStr,
    rechazos_upserted: totalR,
    ventas_upserted: totalV,
    errors,
    duration_ms: durationMs,
  })
  if (logErr) console.warn(`(sync_log no escrito: ${logErr.message})`)
}

async function main() {
  const mode = process.argv[2] ?? "test"
  const arg = process.argv[3]
  if (mode === "test") await modeTest(arg ?? new Date().toISOString().slice(0, 10))
  else if (mode === "backfill") await modeBackfill(arg ?? "2026-04-30", process.argv[4] ?? new Date().toISOString().slice(0, 10))
  else { console.error(`Unknown mode: ${mode}`); process.exit(1) }
  process.exit(0)
}
main().catch(e => { console.error("Fatal:", e); process.exit(1) })

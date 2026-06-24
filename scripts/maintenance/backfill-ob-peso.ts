/**
 * Backfill de Ocupación de Bodega (incluye la nueva columna peso_total).
 * Corre `recalcOcupacionBodegaDia` día por día contra Chess, sin pasar por el
 * endpoint de Vercel ni recalcular rechazos. Usa la lógica de
 * `src/lib/sync/ocupacion-bodega.ts` (una sola fuente de verdad).
 *
 * Pre-requisitos: /root/dpo-app/.env.local apuntando a Pampeana, con
 * SUPABASE_SERVICE_ROLE_KEY + CHESS_API_*. El maestro chess_articulos ya debe
 * tener peso_bulto sincronizado (lo usa el recalc para el peso).
 *
 * Uso:
 *   npx tsx scripts/maintenance/backfill-ob-peso.ts 2026-01-01 2026-06-24
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import {
  chessLogin,
  type ChessCredentials,
} from "../../src/lib/sync/rechazos-sync"
import { recalcOcupacionBodegaDia } from "../../src/lib/sync/ocupacion-bodega"

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

async function main() {
  const fromStr = process.argv[2] ?? "2026-01-01"
  const toStr = process.argv[3] ?? new Date().toISOString().slice(0, 10)

  console.log(`Supabase: ${SUPABASE_URL}`)
  console.log(`Chess:    ${chess.baseUrl} (user ${chess.user})`)
  console.log(`Rango:    ${fromStr} → ${toStr}`)
  console.log()

  const sessionId = await chessLogin(chess)
  console.log("Chess login OK\n")

  const from = new Date(fromStr + "T00:00:00Z")
  const to = new Date(toStr + "T00:00:00Z")
  const startedAt = Date.now()

  let totalDias = 0, totalViajes = 0, sinDatos = 0
  let totalCeq = 0
  const fallidos: string[] = []

  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const f = d.toISOString().slice(0, 10)
    totalDias++
    try {
      const r = await recalcOcupacionBodegaDia(supabase, chess, sessionId, f)
      totalViajes += r.viajes
      totalCeq += r.ceqTotal
      if (r.viajes === 0) sinDatos++
      console.log(`${f}: viajes=${r.viajes} ceq=${Math.round(r.ceqTotal)} lineas=${r.lineas} skipNoBp=${r.skipNoBp}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.log(`${f}: FATAL ${msg}`)
      fallidos.push(`${f}: ${msg}`)
    }
  }

  const durationMs = Date.now() - startedAt
  console.log()
  console.log("=== RESUMEN ===")
  console.log(`Días procesados:  ${totalDias}`)
  console.log(`Días sin viajes:  ${sinDatos}`)
  console.log(`Viajes upserted:  ${totalViajes}`)
  console.log(`CEq total:        ${Math.round(totalCeq)}`)
  console.log(`Fallidos:         ${fallidos.length}`)
  if (fallidos.length) fallidos.forEach((x) => console.log(`  - ${x}`))
  console.log(`Duración:         ${(durationMs / 1000).toFixed(1)}s`)
  process.exit(0)
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1) })

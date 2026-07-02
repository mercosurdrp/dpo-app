/**
 * Backfill de ventas de MOSTRADOR (Chess, FCVTA sin patente válida) hacia
 * `ventas_mostrador_diarias`/`_sku`. Necesario porque el sync histórico las
 * descartaba (solo guardaba lo distribuido en `ventas_diarias`). NO toca
 * `rechazos` ni `ventas_diarias` — solo agrega las tablas de mostrador.
 *
 * Pre-requisitos: `.env.local` apuntando al tenant correcto, con
 * SUPABASE_SERVICE_ROLE_KEY + CHESS_API_*.
 *
 * Uso:
 *   npx tsx scripts/maintenance/backfill-ventas-mostrador.ts 2026-01-01 2026-07-02
 */
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import {
  chessLogin,
  syncVentasMostradorForDate,
  type ChessCredentials,
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
  // Node 20 no trae WebSocket nativo y supabase-js lo exige al construir el
  // cliente realtime; este script no usa realtime, así que va un stub.
  realtime: { transport: class {} as unknown as new (...args: unknown[]) => WebSocket },
})

function diaSiguiente(fecha: string): string {
  const d = new Date(Date.parse(`${fecha}T00:00:00Z`) + 24 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

async function main() {
  const [desde, hasta] = process.argv.slice(2)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? "")) {
    console.error("Uso: npx tsx scripts/maintenance/backfill-ventas-mostrador.ts <desde> <hasta>")
    process.exit(1)
  }

  console.log(`Supabase: ${SUPABASE_URL}`)
  console.log(`Chess:    ${chess.baseUrl} (user ${chess.user})`)
  const sessionId = await chessLogin(chess)
  console.log("Chess login OK\n")

  let totalUpserted = 0
  let sinDatos = 0
  for (let fecha = desde; fecha <= hasta; fecha = diaSiguiente(fecha)) {
    try {
      const r = await syncVentasMostradorForDate(fecha, { supabase, chess, sessionId })
      if (r.sin_datos) {
        sinDatos++
        console.log(`${fecha}: sin datos`)
      } else {
        totalUpserted += r.upserted
        console.log(`${fecha}: mostrador fleteros=${r.upserted}`)
      }
    } catch (e) {
      console.error(`${fecha}: ERROR ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`\nListo. Días sin datos: ${sinDatos}. Upserts fletero-día: ${totalUpserted}.`)
}

main()

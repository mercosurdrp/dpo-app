/**
 * Smoke: invoca buildRechazosCSV con service-role para validar formato.
 *   - Caso normal: 2026-05-01..11 (449 filas, bien por debajo del cap)
 *   - Caso filtrado: motivo 15
 * Imprime: total, primeras 3 líneas, tamaño bytes, nombre.
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: ".env.local" })

import { buildRechazosCSV } from "../../src/lib/rechazos/export-csv"
import type { SupaClient } from "../../src/lib/rechazos/comparado"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as unknown as SupaClient

async function main() {
  console.log("\n══ 1. Export todo mayo 1-11 ══")
  const t0 = Date.now()
  const r1 = await buildRechazosCSV(supa, { desde: "2026-05-01", hasta: "2026-05-11" })
  console.log(`Wall: ${Date.now() - t0} ms`)
  if (!r1.ok) {
    console.log(`too_many: ${r1.total} (max ${r1.max})`)
    return
  }
  console.log(`Filename: ${r1.filename}`)
  console.log(`Total: ${r1.total}`)
  console.log(`Size: ${r1.csv.length} chars / ${Buffer.byteLength(r1.csv, "utf8")} bytes`)
  console.log(`---- HEAD ----`)
  console.log(r1.csv.split("\r\n").slice(0, 4).join("\n"))
  console.log(`---- 1 línea aleatoria ----`)
  const lines = r1.csv.split("\r\n")
  console.log(lines[Math.floor(lines.length / 2)])

  console.log("\n══ 2. Export filtrado motivo 15 ══")
  const t1 = Date.now()
  const r2 = await buildRechazosCSV(supa, {
    desde: "2026-05-01", hasta: "2026-05-11",
    filters: { id_rechazo: [15] },
  })
  console.log(`Wall: ${Date.now() - t1} ms`)
  if (r2.ok) {
    console.log(`Filtered total: ${r2.total} (esperado 126)`)
    console.log(`Size: ${r2.csv.length} chars`)
  }

  console.log("\n══ 3. Test cap (simulamos rango histórico grande) ══")
  const t2 = Date.now()
  const r3 = await buildRechazosCSV(supa, { desde: "2026-01-01", hasta: "2026-12-31" })
  console.log(`Wall: ${Date.now() - t2} ms`)
  if (!r3.ok) {
    console.log(`✓ cap respetado: total=${r3.total} > max=${r3.max}`)
  } else {
    console.log(`Total: ${r3.total} (debajo del cap, OK)`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

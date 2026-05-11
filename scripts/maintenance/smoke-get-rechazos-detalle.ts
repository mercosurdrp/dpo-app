/**
 * Smoke local: invoca la lógica pura `getRechazosDetalle` con service-role.
 *   1. Drill por motivo id=15 (ERROR DE DISTRIBUCIÓN) en mayo 1-11
 *   2. Drill por chofer AF469UR
 *   3. Drill por canal AUTOSERVICIO
 *
 * Uso: cd /root/dpo-app && npx tsx scripts/maintenance/smoke-get-rechazos-detalle.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: ".env.local" })

import { getRechazosDetalle } from "../../src/lib/rechazos/detalle"
import type { SupaClient } from "../../src/lib/rechazos/comparado"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as unknown as SupaClient

async function main() {
  const desde = "2026-05-01", hasta = "2026-05-11"

  console.log("\n══ 1. Motivo id=15 (ERROR DE DISTRIBUCIÓN) ══")
  const t0 = Date.now()
  const r1 = await getRechazosDetalle(supa, {
    desde, hasta,
    drill: { tipo: "motivo", value: 15 },
    limit: 5,
  })
  console.log(`Wall: ${Date.now() - t0} ms`)
  console.log(`Total: ${r1.total} (offset=${r1.offset}, limit=${r1.limit}, returned=${r1.rows.length})`)
  console.log("Sample rows:")
  for (const r of r1.rows.slice(0, 3)) {
    console.log(`  ${r.fecha} | ${r.chofer_display.padEnd(10)} | ${r.ds_rechazo.padEnd(25)} | ${(r.nombre_cliente ?? "(?)").padEnd(30)} | ${r.bultos_rechazados}b · $${r.monto_neto?.toFixed(0) ?? "—"}`)
  }

  console.log("\n══ 2. Chofer AF469UR ══")
  const t1 = Date.now()
  const r2 = await getRechazosDetalle(supa, {
    desde, hasta,
    drill: { tipo: "chofer", value: "AF469UR" },
    limit: 5,
  })
  console.log(`Wall: ${Date.now() - t1} ms · total=${r2.total}`)
  for (const r of r2.rows.slice(0, 3)) {
    console.log(`  ${r.fecha} | ${r.patente} | ${r.ds_rechazo.padEnd(25)} | ${(r.nombre_cliente ?? "(?)").padEnd(30)} | $${r.monto_neto?.toFixed(0) ?? "—"}`)
  }

  console.log("\n══ 3. Canal AUTOSERVICIO ══")
  const t2 = Date.now()
  const r3 = await getRechazosDetalle(supa, {
    desde, hasta,
    drill: { tipo: "canal", value: "AUTOSERVICIO" },
    limit: 3,
  })
  console.log(`Wall: ${Date.now() - t2} ms · total=${r3.total}`)
  for (const r of r3.rows.slice(0, 3)) {
    console.log(`  ${r.fecha} | ${r.ds_canal_mkt} | ${r.ds_rechazo.padEnd(25)} | $${r.monto_neto?.toFixed(0) ?? "—"}`)
  }

  console.log("\n══ 4. Sin drill (todos los rechazos del rango) ══")
  const t3 = Date.now()
  const r4 = await getRechazosDetalle(supa, {
    desde, hasta,
    limit: 3,
  })
  console.log(`Wall: ${Date.now() - t3} ms · total=${r4.total} (esperado 449)`)
}

main().catch(e => { console.error(e); process.exit(1) })

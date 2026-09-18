/**
 * Backfill de CERRADO vs. horario del PDV, ejercitando el código real
 * (`syncPdvHorarios` + `recalcularCerradoHorarios`), el mismo que corre el cron.
 *
 * Se usa la primera vez, después de aplicar
 * APLICAR_EN_PAMPEANA_CERRADO_HORARIOS.sql, y cada vez que se quiera recalcular
 * un rango entero a mano (por ejemplo tras mover el margen de la zona gris).
 * Después de esto el cron de las 07:30 UTC lo mantiene solo.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-cerrado-horarios.ts
 *   npx tsx --env-file=.env.local scripts/backfill-cerrado-horarios.ts 2026-01-01 2026-12-31
 *   npx tsx --env-file=.env.local scripts/backfill-cerrado-horarios.ts 2026-01-01 2026-12-31 30
 *
 * El tercer argumento es el margen de la zona gris en minutos (default 15).
 * ESCRIBE en Supabase: upsert de pdv_horarios y de cerrado_horario_analisis.
 */
import { createClient } from "@supabase/supabase-js"
import { syncPdvHorarios } from "../src/lib/cerrado-horarios/sync-horarios"
import { recalcularCerradoHorarios } from "../src/lib/cerrado-horarios/analisis"
import { MARGEN_MIN_DEFAULT } from "../src/lib/cerrado-horarios/clasificar"

const ORDEN = [
  "DENTRO",
  "SIESTA",
  "TEMPRANO",
  "TARDE",
  "NO_ABRE",
  "BORDE",
  "SIN_VH",
  "SIN_HORA",
]

async function main() {
  const desde = process.argv[2] ?? "2026-01-01"
  const hasta = process.argv[3] ?? new Date().toISOString().slice(0, 10)
  const margen = process.argv[4] ? Number(process.argv[4]) : MARGEN_MIN_DEFAULT

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Correr con: npx tsx --env-file=.env.local scripts/backfill-cerrado-horarios.ts",
    )
    process.exit(1)
  }
  if (!process.env.MERCOSUR_DB_URL) {
    console.error("Falta MERCOSUR_DB_URL (la base del dashboard Mercosur).")
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\nReplicando el relevamiento de horarios…`)
  const h = await syncPdvHorarios(supabase)
  console.log(
    `  ${h.upserted} filas · ciclos ${h.ciclos.join(", ")} · ${h.duration_ms} ms`,
  )

  console.log(`\nClasificando ${desde} … ${hasta} (margen ±${margen} min)…`)
  const a = await recalcularCerradoHorarios(supabase, desde, hasta, margen)

  console.log(`\n  ${a.casos} veces de CERRADO · ${a.duration_ms} ms`)
  if (a.borrados > 0) console.log(`  ${a.borrados} filas viejas borradas`)
  console.log("")
  for (const clave of ORDEN) {
    const v = a.por_clasificacion[clave] ?? 0
    if (v === 0) continue
    const pct = a.casos > 0 ? ((100 * v) / a.casos).toFixed(1) : "0.0"
    console.log(`  ${clave.padEnd(10)} ${String(v).padStart(5)}  ${pct.padStart(5)}%`)
  }

  console.log(
    `\n  TASA DE CUMPLIMIENTO: ${a.tasa?.toFixed(1) ?? "n/d"}%` +
    `  (cobertura ${a.cobertura?.toFixed(1) ?? "n/d"}%)`,
  )
  console.log(
    `  ${a.dentro} veces fuimos en horario y estaba cerrado · ` +
    `${a.fuera} veces fuimos fuera\n`,
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

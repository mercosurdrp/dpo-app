/**
 * Smoke local: invoca la lógica pura `getRechazosComparado` con service-role.
 * Sirve para validar números, sanity checks y performance antes de subir UI.
 *
 * Uso: cd /root/dpo-app && npx tsx scripts/maintenance/smoke-get-rechazos-comparado.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
config({ path: ".env.local" })

import { getRechazosComparado, type SupaClient } from "../../src/lib/rechazos/comparado"

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as unknown as SupaClient

async function main() {
  const desde = "2026-05-01"
  const hasta = "2026-05-11"

  console.log(`\n══ Llamada 1: rango ${desde}..${hasta} (sin filtros) ══`)
  const t0 = Date.now()
  const res = await getRechazosComparado(supa, { desde, hasta })
  const elapsed = Date.now() - t0
  if (!res.ok) { console.error("ERROR:", res.error); process.exit(1) }
  console.log(`Wall-time: ${elapsed} ms  |  reported duration_ms: ${res.data.meta.duration_ms} ms`)

  const d = res.data
  const truncated = {
    meta: d.meta,
    actual: d.actual,
    previous: d.previous,
    delta: d.delta,
    alerts: d.alerts,
    series: { por_dia: d.series.por_dia, por_semana: d.series.por_semana },
    agg: {
      por_motivo: d.agg.por_motivo.slice(0, 8),
      por_categoria: d.agg.por_categoria,
      por_chofer: {
        ranking_principal: d.agg.por_chofer.ranking_principal,
        ranking_sin_denominador: d.agg.por_chofer.ranking_sin_denominador,
      },
      por_cliente: d.agg.por_cliente.slice(0, 5),
      por_producto: d.agg.por_producto.slice(0, 5),
      por_canal: d.agg.por_canal,
      por_supervisor: d.agg.por_supervisor.slice(0, 5),
    },
    top_variaciones: d.top_variaciones,
  }
  console.log(JSON.stringify(truncated, null, 2))

  console.log("\n══ Sanity checks ══")
  const approxEq = (a: number, b: number) => Math.abs(a - b) < 0.5
  const bultos_motivo_sum = d.agg.por_motivo.reduce((s, r) => s + r.bultos, 0)
  const bultos_cat_sum    = d.agg.por_categoria.reduce((s, r) => s + r.bultos, 0)
  const bultos_chofer_sum =
    d.agg.por_chofer.ranking_principal.reduce((s, r) => s + r.bultos, 0) +
    d.agg.por_chofer.ranking_sin_denominador.reduce((s, r) => s + r.bultos, 0)
  const bultos_canal_sum  = d.agg.por_canal.reduce((s, r) => s + r.bultos, 0)
  console.log(`actual.bultos          = ${d.actual.bultos}`)
  console.log(`Σ por_motivo.bultos    = ${bultos_motivo_sum}  ${approxEq(bultos_motivo_sum, d.actual.bultos) ? "✓" : "✗"}`)
  console.log(`Σ por_categoria.bultos = ${bultos_cat_sum}     ${approxEq(bultos_cat_sum,    d.actual.bultos) ? "✓" : "✗"}`)
  console.log(`Σ por_chofer.bultos    = ${bultos_chofer_sum}  ${approxEq(bultos_chofer_sum, d.actual.bultos) ? "✓" : "✗"}`)
  console.log(`Σ por_canal.bultos     = ${bultos_canal_sum}   ${approxEq(bultos_canal_sum,  d.actual.bultos) ? "✓" : "✗"}`)
  console.log(`actual.eventos = ${d.actual.eventos} (esperado 449)`)
  console.log(`actual.monto_neto = ${d.actual.monto_neto.toFixed(2)} (esperado ~10.490.139)`)
  console.log(`tasa global = ${d.actual.tasa.toFixed(2)}%`)
  console.log(`# motivos = ${d.agg.por_motivo.length}, # canales = ${d.agg.por_canal.length}`)
  console.log(`# choferes principal = ${d.agg.por_chofer.ranking_principal.length}, sin denominador = ${d.agg.por_chofer.ranking_sin_denominador.length}`)
  console.log(`delta.comparison_invalidated_by =`, d.delta.comparison_invalidated_by)
  console.log(`# días serie = ${d.series.por_dia.length}, # semanas = ${d.series.por_semana.length}`)
  console.log(`alerts.items.length = ${d.alerts.items.length}`)
  console.log(`alerts.tendencia_evaluation = ${d.alerts.tendencia_evaluation}`)

  console.log(`\n══ Llamada 2 (warm): mismo rango ══`)
  const t1 = Date.now()
  const res2 = await getRechazosComparado(supa, { desde, hasta })
  console.log(`Wall-time warm: ${Date.now() - t1} ms`)
  if (res2.ok) console.log(`reported duration_ms warm: ${res2.data.meta.duration_ms} ms`)
}

main().catch(e => { console.error(e); process.exit(1) })

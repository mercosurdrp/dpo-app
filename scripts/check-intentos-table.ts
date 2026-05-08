import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  // 1. ¿La tabla existe?
  const { data: check1, error: e1 } = await supabase
    .from("examen_intentos")
    .select("id", { count: "exact", head: true })
  if (e1) {
    console.log("✗ Error accediendo a examen_intentos:", e1.message)
    console.log("  → La migración 026 probablemente NO corrió.")
    return
  }
  console.log("✓ Tabla examen_intentos existe")

  // 2. Cuántos intentos hay
  const { count } = await supabase
    .from("examen_intentos")
    .select("*", { count: "exact", head: true })
  console.log(`  Total de filas: ${count}`)

  // 3. Cuántas asistencias hay con nota (deberían haber generado intento 1 del backfill)
  const { count: conNota } = await supabase
    .from("asistencias")
    .select("*", { count: "exact", head: true })
    .not("nota", "is", null)
  console.log(`  Asistencias con nota: ${conNota}`)
  if (count !== conNota) {
    console.log(`  ⚠️  Mismatch: ${conNota} asistencias con nota vs ${count} intentos. Backfill posiblemente incompleto.`)
  }

  // 4. Ver últimos intentos registrados
  const { data: ultimos } = await supabase
    .from("examen_intentos")
    .select("capacitacion_id, empleado_id, intento_n, nota, created_at")
    .order("created_at", { ascending: false })
    .limit(5)
  console.log("\nÚltimos 5 intentos registrados:")
  ultimos?.forEach((i) => {
    console.log(`  intento ${i.intento_n} — nota ${i.nota} — ${i.created_at}`)
  })

  // 5. Ver desaprobados (candidatos a retake)
  const { data: desap } = await supabase
    .from("asistencias")
    .select("empleado_id, capacitacion_id, nota, resultado")
    .eq("resultado", "desaprobado")
    .limit(5)
  console.log(`\nDesaprobados (candidatos a retake): ${desap?.length ?? 0}`)
  desap?.slice(0, 5).forEach((d) => {
    console.log(`  empleado=${d.empleado_id.substring(0, 8)}... nota=${d.nota}`)
  })
}

main().catch(console.error)

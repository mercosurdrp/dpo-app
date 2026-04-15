import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const hoy = new Date().toISOString().slice(0, 10)
  console.log("Hoy:", hoy)

  const { data: egresos } = await supabase
    .from("registros_vehiculos")
    .select("fecha,dominio,chofer,ayudante1,ayudante2")
    .eq("fecha", hoy)
    .eq("tipo", "egreso")
  console.log(`\nEgresos hoy: ${egresos?.length ?? 0}`)
  for (const e of (egresos || []).slice(0, 10)) console.log(" ", e)

  const { data: empleados } = await supabase
    .from("empleados")
    .select("legajo,nombre,sector")
    .eq("activo", true)
    .limit(50)
  console.log(`\nEmpleados activos: ${empleados?.length}`)
  for (const e of (empleados || []).slice(0, 5)) console.log(" ", e)

  // Intersección: los ayudantes de hoy vs los nombres en empleados
  const empleadosNoms = new Set(
    (empleados || []).map((e) => e.nombre.trim().toUpperCase()),
  )
  const ayudantesHoy = new Set<string>()
  for (const e of egresos || []) {
    if (e.ayudante1) ayudantesHoy.add(e.ayudante1.trim().toUpperCase())
    if (e.ayudante2) ayudantesHoy.add(e.ayudante2.trim().toUpperCase())
  }
  console.log(`\nAyudantes distintos en egresos hoy: ${ayudantesHoy.size}`)
  for (const a of ayudantesHoy) {
    const match = empleadosNoms.has(a)
    console.log(` ${match ? "✓" : "✗"} ${a}`)
  }
}
main().catch(console.error)

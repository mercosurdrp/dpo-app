import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const PARES = [
  { nombre: "Hugo Ovejero", viejo: 180, nuevo: 43907801 },
  { nombre: "Pablo Selenzo", viejo: 173, nuevo: 425283564 },
  { nombre: "Ruben Galvez", viejo: 159, nuevo: 36467481 },
]

async function check(legajo: number) {
  const { data: emp } = await supabase
    .from("empleados").select("id, nombre, activo")
    .eq("legajo", legajo).maybeSingle()
  if (!emp) return null

  const [{ count: asist }, { count: marcas }, { count: novedades }, { count: respuestas }, { count: intentos }] = await Promise.all([
    supabase.from("asistencias").select("*", { count: "exact", head: true }).eq("empleado_id", emp.id),
    supabase.from("asistencia_marcas").select("*", { count: "exact", head: true }).eq("empleado_id", emp.id),
    supabase.from("asistencia_novedades").select("*", { count: "exact", head: true }).eq("empleado_id", emp.id),
    supabase.from("capacitacion_respuestas").select("*", { count: "exact", head: true }).eq("empleado_id", emp.id),
    supabase.from("examen_intentos").select("*", { count: "exact", head: true }).eq("empleado_id", emp.id),
  ])
  return { emp, asist, marcas, novedades, respuestas, intentos }
}

async function main() {
  for (const p of PARES) {
    console.log(`\n=== ${p.nombre} ===`)
    for (const tipo of ["viejo", "nuevo"] as const) {
      const legajo = p[tipo]
      const r = await check(legajo)
      if (!r) { console.log(`  legajo ${legajo} (${tipo}): no existe`); continue }
      console.log(`  ${tipo} legajo=${legajo} activo=${r.emp.activo} id=${r.emp.id}`)
      console.log(`    asistencias_capac=${r.asist}  marcas_fichada=${r.marcas}  novedades=${r.novedades}  respuestas=${r.respuestas}  intentos=${r.intentos}`)
    }
  }
}

main().catch(console.error)

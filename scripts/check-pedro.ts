import { createClient } from "@supabase/supabase-js"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: empleados } = await admin
    .from("empleados")
    .select("id, legajo, nombre, profile_id, activo")
    .ilike("nombre", "%MARTINEZ%")

  console.log("Empleados con MARTINEZ:")
  empleados?.forEach((e) => {
    console.log(`  ${e.legajo} - ${e.nombre} (profile_id=${e.profile_id ?? "NULL"}, activo=${e.activo})`)
  })

  const pedros = empleados?.filter((e) => e.nombre.toUpperCase().includes("PEDRO")) ?? []
  console.log(`\nPedros encontrados: ${pedros.length}`)

  for (const pedro of pedros) {
    console.log(`\n=== ${pedro.nombre} (legajo ${pedro.legajo}) ===`)
    console.log(`  empleado_id: ${pedro.id}`)
    console.log(`  profile_id: ${pedro.profile_id ?? "NULL — NO PUEDE LOGUEARSE"}`)

    const { data: asistencias } = await admin
      .from("asistencias")
      .select("capacitacion_id, presente, nota, resultado, capacitaciones(titulo, visible)")
      .eq("empleado_id", pedro.id)

    console.log(`\n  Asistencias (${asistencias?.length ?? 0}):`)
    asistencias?.forEach((a: any) => {
      console.log(`    [${a.resultado}] nota=${a.nota} visible=${a.capacitaciones?.visible} — "${a.capacitaciones?.titulo}" (cap_id=${a.capacitacion_id})`)
    })

    const { data: intentos } = await admin
      .from("examen_intentos")
      .select("intento_n, nota, capacitacion_id, capacitaciones(titulo)")
      .eq("empleado_id", pedro.id)
      .order("capacitacion_id")
      .order("intento_n")

    console.log(`\n  Intentos registrados (${intentos?.length ?? 0}):`)
    intentos?.forEach((i: any) => {
      console.log(`    #${i.intento_n}: nota ${i.nota} — "${i.capacitaciones?.titulo}"`)
    })
  }
}

main().catch(console.error)

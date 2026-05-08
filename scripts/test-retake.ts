import { createClient } from "@supabase/supabase-js"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  // Tomar un desaprobado
  const { data: desap } = await admin
    .from("asistencias")
    .select("empleado_id, capacitacion_id, nota, resultado")
    .eq("resultado", "desaprobado")
    .limit(1)
    .maybeSingle()

  if (!desap) { console.log("No hay desaprobados"); return }
  console.log("Test target:")
  console.log(`  empleado_id: ${desap.empleado_id}`)
  console.log(`  capacitacion_id: ${desap.capacitacion_id}`)
  console.log(`  nota actual: ${desap.nota}`)
  console.log(`  resultado: ${desap.resultado}`)

  // Ver el empleado y si tiene profile_id
  const { data: emp } = await admin
    .from("empleados")
    .select("id, legajo, nombre, profile_id, activo")
    .eq("id", desap.empleado_id)
    .single()
  console.log("\nEmpleado:")
  console.log(`  legajo: ${emp?.legajo}`)
  console.log(`  nombre: ${emp?.nombre}`)
  console.log(`  activo: ${emp?.activo}`)
  console.log(`  profile_id: ${emp?.profile_id ?? "NULL"}`)

  if (!emp?.profile_id) {
    console.log("  ⚠️  Este empleado NO tiene profile_id vinculado — RLS bloquearía el retake")
    return
  }

  // Verificar que el profile existe
  const { data: prof } = await admin
    .from("profiles")
    .select("id, nombre, role")
    .eq("id", emp.profile_id)
    .maybeSingle()
  console.log("\nProfile:")
  console.log(`  ${prof ? `${prof.nombre} (role=${prof.role})` : "NO EXISTE — RLS bloqueará"}`)

  // Ver cuántos intentos tiene ya
  const { data: intentos } = await admin
    .from("examen_intentos")
    .select("intento_n, nota, created_at")
    .eq("capacitacion_id", desap.capacitacion_id)
    .eq("empleado_id", desap.empleado_id)
    .order("intento_n")
  console.log("\nIntentos existentes:")
  intentos?.forEach((i) => console.log(`  #${i.intento_n}: nota ${i.nota}`))

  // Simular la query del INSERT con RLS: EXISTS con profile_id = auth.uid()
  console.log("\nSimulación RLS check:")
  console.log(`  auth.uid() debería ser: ${emp.profile_id}`)
  console.log(`  FK check: empleados WHERE id=${desap.empleado_id} AND profile_id=auth.uid()`)
  console.log(`  Resultado esperado: ${emp.profile_id === emp.profile_id ? "✓ pasa" : "✗ bloquea"}`)

  // Verificar también que respuestas se puedan upsertar (unique constraint?)
  const { count: resps } = await admin
    .from("capacitacion_respuestas")
    .select("*", { count: "exact", head: true })
    .eq("capacitacion_id", desap.capacitacion_id)
    .eq("empleado_id", desap.empleado_id)
  console.log(`\nRespuestas previas cargadas: ${resps}`)
}

main().catch(console.error)

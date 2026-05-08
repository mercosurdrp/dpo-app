import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const PARES = [
  { nombre: "Hugo Ovejero", legajoViejo: 180, legajoNuevo: 43907801 },
  { nombre: "Pablo Selenzo", legajoViejo: 173, legajoNuevo: 425283564 },
  { nombre: "Ruben Galvez", legajoViejo: 159, legajoNuevo: 36467481 },
]

async function main() {
  // Listar todos los auth users una vez
  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({
    page: 1, perPage: 1000,
  })
  if (authErr) { console.log("Error listing auth users:", authErr.message); return }

  for (const p of PARES) {
    console.log(`\n=== ${p.nombre} ===`)

    const emailViejo = `${p.legajoViejo}@dpo.local`
    const authUser = authList.users.find((u) => u.email === emailViejo)
    if (!authUser) { console.log(`  ✗ No hay auth user ${emailViejo}, salteo`); continue }
    const authUid = authUser.id
    console.log(`  auth.uid (${emailViejo}) = ${authUid}`)

    const { data: empViejo } = await supabase
      .from("empleados").select("id, profile_id, activo")
      .eq("legajo", p.legajoViejo).maybeSingle()
    const { data: empNuevo } = await supabase
      .from("empleados").select("id, profile_id, activo, nombre")
      .eq("legajo", p.legajoNuevo).maybeSingle()

    if (!empViejo) console.log(`  ⚠️  No se encontró empleado viejo legajo ${p.legajoViejo}`)
    if (!empNuevo) { console.log(`  ✗ No se encontró empleado nuevo legajo ${p.legajoNuevo}, salteo`); continue }

    // 1) Upsert profile
    const { error: profErr } = await supabase
      .from("profiles")
      .upsert({
        id: authUid,
        email: emailViejo,
        nombre: empNuevo.nombre,
        role: "empleado",
        active: true,
      }, { onConflict: "id" })
    if (profErr) { console.log(`  ✗ Error upsert profile: ${profErr.message}`); continue }
    console.log(`  ✓ Profile upserteado (role=empleado)`)

    // 2) Desvincular empleado viejo PRIMERO (para liberar el FK profile_id si está en uso)
    if (empViejo) {
      const { error: detErr } = await supabase
        .from("empleados")
        .update({ profile_id: null, activo: false })
        .eq("id", empViejo.id)
      if (detErr) { console.log(`  ✗ Error desvinculando viejo: ${detErr.message}`); continue }
      console.log(`  ✓ Empleado viejo legajo ${p.legajoViejo} desvinculado (profile_id=NULL, activo=false)`)
    }

    // 3) Vincular empleado nuevo al auth.uid
    const { error: linkErr } = await supabase
      .from("empleados")
      .update({ profile_id: authUid })
      .eq("id", empNuevo.id)
    if (linkErr) { console.log(`  ✗ Error vinculando nuevo: ${linkErr.message}`); continue }
    console.log(`  ✓ Empleado nuevo legajo ${p.legajoNuevo} vinculado a auth.uid`)
  }

  console.log("\n=== Verificación final ===")
  for (const p of PARES) {
    const { data } = await supabase
      .from("empleados")
      .select("legajo, nombre, activo, profile_id")
      .or(`legajo.eq.${p.legajoViejo},legajo.eq.${p.legajoNuevo}`)
      .order("legajo")
    console.log(`\n${p.nombre}:`)
    data?.forEach((e) => {
      console.log(`  legajo=${e.legajo} activo=${e.activo} profile_id=${e.profile_id ?? "NULL"}`)
    })
  }
}

main().catch(console.error)

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const legajo = parseInt(process.argv[2], 10)
  const nombre = process.argv[3]
  const dni = process.argv[4]
  if (!legajo || !nombre || !dni) {
    console.log("Uso: npx tsx scripts/fix-empleado.ts <legajo> <nombre> <dni>")
    process.exit(1)
  }

  const nombreUpper = nombre.toUpperCase()
  const newEmail = `${legajo}@dpo.local`

  // 1. Upsert empleado
  const { data: existing } = await supabase
    .from("empleados")
    .select("*")
    .eq("legajo", legajo)
    .maybeSingle()

  let empId: string
  if (existing) {
    console.log(`Empleado existente: ${existing.nombre} (activo=${existing.activo})`)
    const { error } = await supabase
      .from("empleados")
      .update({ nombre: nombreUpper, numero_id: dni, activo: true })
      .eq("id", existing.id)
    if (error) {
      console.log("Empleado update ERROR:", error.message)
      return
    }
    empId = existing.id
    console.log("✓ Empleado reactivado/actualizado")
  } else {
    const { data, error } = await supabase
      .from("empleados")
      .insert({ legajo, nombre: nombreUpper, numero_id: dni, activo: true })
      .select("*")
      .single()
    if (error) {
      console.log("Empleado insert ERROR:", error.message)
      return
    }
    empId = data.id
    console.log("✓ Empleado creado")
  }

  // 2. Catálogo de choferes (para TML/OWD)
  const { error: catErr } = await supabase
    .from("catalogo_choferes")
    .upsert({ nombre: nombreUpper, active: true }, { onConflict: "nombre" })
  if (catErr) console.log("Catalogo ERROR:", catErr.message)
  else console.log("✓ Catálogo choferes OK")

  // 3. Mapeo empleado-chofer
  const { data: existingMapeo } = await supabase
    .from("mapeo_empleado_chofer")
    .select("id")
    .eq("nombre_chofer", nombreUpper)
    .maybeSingle()
  if (!existingMapeo) {
    const { error: mapErr } = await supabase
      .from("mapeo_empleado_chofer")
      .insert({ empleado_id: empId, nombre_chofer: nombreUpper })
    if (mapErr) console.log("Mapeo ERROR:", mapErr.message)
    else console.log("✓ Mapeo creado")
  } else {
    console.log("✓ Mapeo ya existe")
  }

  // 4. Auth user: buscar cualquier profile vinculado y migrar
  const { data: emp } = await supabase
    .from("empleados")
    .select("profile_id")
    .eq("id", empId)
    .single()

  let userId = emp?.profile_id as string | null

  if (!userId) {
    // No linkeado: crear nuevo
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: newEmail,
      password: dni,
      email_confirm: true,
    })
    if (createErr) {
      // Puede existir ya. Buscar por email.
      const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 500 })
      const u = users?.find((x) => x.email === newEmail)
      if (u) userId = u.id
      else {
        console.log("Auth create ERROR:", createErr.message)
        return
      }
    } else {
      userId = created.user.id
    }
  }

  // Actualizar auth: email + password
  const { error: updErr } = await supabase.auth.admin.updateUserById(userId!, {
    email: newEmail,
    password: dni,
    email_confirm: true,
  })
  if (updErr) {
    console.log("Auth update ERROR:", updErr.message)
    return
  }
  console.log(`✓ Auth user → ${newEmail} / ${dni}`)

  // Profile sync
  await supabase
    .from("profiles")
    .upsert({
      id: userId!,
      email: newEmail,
      nombre: nombreUpper,
      role: "empleado",
      active: true,
    })
  console.log("✓ Profile sincronizado")

  // Linkear empleado → profile
  await supabase.from("empleados").update({ profile_id: userId }).eq("id", empId)
  console.log("✓ Empleado vinculado a profile")

  console.log("\n>>> Listo. Login: legajo", legajo, "/ DNI", dni)
}

main().catch(console.error)

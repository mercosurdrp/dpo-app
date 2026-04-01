/**
 * Script to create Supabase auth users for all active empleados
 * Login: {legajo}@dpo.local / {numero_id (DNI)}
 * Role: empleado
 *
 * Usage: npx tsx scripts/create-empleado-users.ts
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log("Fetching active empleados...")

  const { data: empleados, error } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, numero_id, profile_id")
    .eq("activo", true)
    .order("legajo")

  if (error) {
    console.error("Error fetching empleados:", error.message)
    process.exit(1)
  }

  console.log(`Found ${empleados.length} active empleados\n`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const emp of empleados) {
    const email = `${emp.legajo}@dpo.local`
    const password = emp.numero_id // DNI as password

    // Skip if already has a profile_id (already linked)
    if (emp.profile_id) {
      console.log(`⏭ Legajo ${emp.legajo} (${emp.nombre}) — already linked, skipping`)
      skipped++
      continue
    }

    if (!password || password.trim() === "") {
      console.log(`⚠ Legajo ${emp.legajo} (${emp.nombre}) — no DNI, skipping`)
      errors++
      continue
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email verification
    })

    if (authError) {
      // Maybe user already exists
      if (authError.message.includes("already been registered")) {
        // Find existing user and link
        const { data: { users } } = await supabase.auth.admin.listUsers()
        const existingUser = users?.find((u) => u.email === email)
        if (existingUser) {
          // Update profile and link
          await supabase
            .from("profiles")
            .update({ nombre: emp.nombre, role: "empleado" })
            .eq("id", existingUser.id)

          await supabase
            .from("empleados")
            .update({ profile_id: existingUser.id })
            .eq("id", emp.id)

          console.log(`🔗 Legajo ${emp.legajo} (${emp.nombre}) — already exists, linked`)
          skipped++
        } else {
          console.log(`❌ Legajo ${emp.legajo} (${emp.nombre}) — ${authError.message}`)
          errors++
        }
        continue
      }

      console.log(`❌ Legajo ${emp.legajo} (${emp.nombre}) — ${authError.message}`)
      errors++
      continue
    }

    const userId = authData.user.id

    // Create/update profile with role empleado
    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        email,
        nombre: emp.nombre,
        role: "empleado",
        active: true,
      })

    // Link empleado to profile
    await supabase
      .from("empleados")
      .update({ profile_id: userId })
      .eq("id", emp.id)

    console.log(`✅ Legajo ${emp.legajo} (${emp.nombre}) — created: ${email}`)
    created++
  }

  console.log(`\n--- Results ---`)
  console.log(`Created: ${created}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors: ${errors}`)
  console.log(`Total: ${empleados.length}`)
}

main().catch(console.error)

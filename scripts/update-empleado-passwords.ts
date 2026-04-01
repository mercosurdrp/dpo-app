/**
 * Update passwords for existing empleado users to use DNI
 * Usage: npx tsx scripts/update-empleado-passwords.ts
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log("Fetching empleados with profile_id...")

  const { data: empleados, error } = await supabase
    .from("empleados")
    .select("id, legajo, nombre, numero_id, profile_id")
    .eq("activo", true)
    .not("profile_id", "is", null)
    .order("legajo")

  if (error) {
    console.error("Error:", error.message)
    process.exit(1)
  }

  console.log(`Found ${empleados.length} linked empleados\n`)

  let updated = 0
  let errors = 0

  for (const emp of empleados) {
    if (!emp.numero_id || !emp.profile_id) continue

    const email = `${emp.legajo}@dpo.local`

    // Update auth user email (to legajo@dpo.local) and password (to DNI)
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      emp.profile_id,
      {
        email,
        password: emp.numero_id,
        email_confirm: true,
      }
    )

    if (updateError) {
      console.log(`❌ Legajo ${emp.legajo} (${emp.nombre}) — ${updateError.message}`)
      errors++
      continue
    }

    // Ensure profile has correct role
    await supabase
      .from("profiles")
      .update({ email, role: "empleado", nombre: emp.nombre })
      .eq("id", emp.profile_id)

    console.log(`✅ Legajo ${emp.legajo} (${emp.nombre}) — updated to ${email} / DNI`)
    updated++
  }

  console.log(`\n--- Results ---`)
  console.log(`Updated: ${updated}`)
  console.log(`Errors: ${errors}`)
}

main().catch(console.error)

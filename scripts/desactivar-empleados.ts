import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const legajos = [159, 180, 40189408, 173]

async function main() {
  console.log("Desactivando empleados...\n")

  for (const legajo of legajos) {
    // 1. Get empleado
    const { data: emp } = await supabase
      .from("empleados")
      .select("id, nombre, legajo, profile_id, activo")
      .eq("legajo", legajo)
      .single()

    if (!emp) {
      console.log(`SKIP legajo ${legajo}: no encontrado`)
      continue
    }

    if (!emp.activo) {
      console.log(`SKIP ${emp.nombre} (${legajo}): ya estaba inactivo`)
      continue
    }

    // 2. Desactivar empleado
    await supabase
      .from("empleados")
      .update({ activo: false })
      .eq("id", emp.id)

    // 3. Desactivar profile si tiene
    if (emp.profile_id) {
      await supabase
        .from("profiles")
        .update({ active: false })
        .eq("id", emp.profile_id)
    }

    console.log(`OK   ${emp.nombre} (legajo ${legajo}) — desactivado`)
  }

  console.log("\nListo.")
}

main()

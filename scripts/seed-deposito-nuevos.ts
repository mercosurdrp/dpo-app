import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const nuevosEmpleados = [
  { legajo: 42323256, nombre: "CEJAS EZEQUIEL", doc: "42323256" },
  { legajo: 43907801, nombre: "OVEJERO HUGO", doc: "43907801" },
  { legajo: 40189408, nombre: "PABLO SELENZO", doc: "40189408" },
  { legajo: 36467481, nombre: "RUBEN GALVEZ", doc: "36467481" },
]

async function main() {
  console.log("Agregando empleados de Depósito...\n")

  let ok = 0
  let fail = 0

  for (const emp of nuevosEmpleados) {
    // 1. Insert empleado record
    const { error: empError } = await supabase.from("empleados").insert({
      legajo: emp.legajo,
      nombre: emp.nombre,
      numero_id: emp.doc,
      activo: true,
      sector: "Depósito",
    })

    if (empError) {
      console.log(`SKIP empleado ${emp.nombre}: ${empError.message}`)
      fail++
      continue
    }

    // 2. Create auth user
    const email = `${emp.doc}@mercosur.local`
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: emp.doc,
        email_confirm: true,
        user_metadata: { nombre: emp.nombre },
      })

    if (authError) {
      console.log(`WARN ${emp.nombre}: empleado creado pero sin usuario auth: ${authError.message}`)
      ok++
      continue
    }

    const userId = authData.user.id

    // 3. Update profile
    await supabase.from("profiles").upsert({
      id: userId,
      email,
      nombre: emp.nombre,
      role: "empleado",
      active: true,
    })

    // 4. Link empleado to profile
    await supabase
      .from("empleados")
      .update({ profile_id: userId })
      .eq("legajo", emp.legajo)

    console.log(`OK   ${emp.nombre} (legajo ${emp.legajo}) — usuario: ${emp.doc} / password: ${emp.doc}`)
    ok++
  }

  console.log(`\nListo: ${ok} creados, ${fail} fallidos`)
}

main()

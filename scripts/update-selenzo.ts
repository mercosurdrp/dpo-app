import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const OLD_DOC = "40189408"
const NEW_DOC = "425283564"

async function main() {
  console.log(`Actualizando PABLO SELENZO: DNI ${OLD_DOC} → ${NEW_DOC}\n`)

  // 1. Get empleado to find profile_id
  // Try by numero_id first, then by legajo
  let { data: emp } = await supabase
    .from("empleados")
    .select("*")
    .eq("numero_id", OLD_DOC)
    .single()

  if (!emp) {
    const res = await supabase
      .from("empleados")
      .select("*")
      .eq("legajo", parseInt(OLD_DOC))
      .single()
    emp = res.data
  }

  if (!emp) {
    // Try by name
    const res = await supabase
      .from("empleados")
      .select("*")
      .ilike("nombre", "%SELENZO%")
      .single()
    emp = res.data
  }

  if (!emp) {
    console.log("ERROR: No se encontró el empleado")
    return
  }

  console.log(`Empleado encontrado: ${emp.nombre} (legajo ${emp.legajo}, profile_id: ${emp.profile_id})`)

  // Check if new legajo already exists
  const { data: existing } = await supabase
    .from("empleados")
    .select("id, nombre")
    .eq("legajo", parseInt(NEW_DOC))
    .single()
  if (existing) {
    console.log(`WARN: legajo ${NEW_DOC} ya existe para ${existing.nombre}`)
  }

  // 2. Update empleados table (legajo + numero_id)
  const { error: empError } = await supabase
    .from("empleados")
    .update({ legajo: parseInt(NEW_DOC), numero_id: NEW_DOC })
    .eq("id", emp.id)

  if (empError) {
    console.log(`ERROR empleado: ${empError.message}`)
    return
  }
  console.log("OK   empleados actualizado")

  // 3. Update auth user (email + password)
  if (emp.profile_id) {
    const { error: authError } = await supabase.auth.admin.updateUserById(
      emp.profile_id,
      {
        email: `${NEW_DOC}@mercosur.local`,
        password: NEW_DOC,
      }
    )

    if (authError) {
      console.log(`ERROR auth: ${authError.message}`)
    } else {
      console.log("OK   auth user actualizado")
    }

    // 4. Update profile email
    const { error: profError } = await supabase
      .from("profiles")
      .update({ email: `${NEW_DOC}@mercosur.local` })
      .eq("id", emp.profile_id)

    if (profError) {
      console.log(`ERROR profile: ${profError.message}`)
    } else {
      console.log("OK   profile actualizado")
    }
  }

  console.log(`\nListo. Nuevas credenciales:`)
  console.log(`  Usuario: ${NEW_DOC}@mercosur.local`)
  console.log(`  Password: ${NEW_DOC}`)
}

main()

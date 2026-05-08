import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const instructores = [
  { user: "ealtube", nombre: "E. Altube" },
  { user: "sroselli", nombre: "S. Roselli" },
  { user: "eteves", nombre: "E. Teves" },
  { user: "fperez", nombre: "F. Perez" },
  { user: "posteneros", nombre: "P. Osteneros" },
  { user: "cmorel", nombre: "C. Morel" },
  { user: "davaro", nombre: "D. Avaro" },
]

const PASSWORD = "mercosur2026"

async function main() {
  console.log("Creando instructores...\n")

  for (const inst of instructores) {
    const email = `${inst.user}@mercosur.local`

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { nombre: inst.nombre },
      })

    if (authError) {
      console.log(`SKIP ${inst.user}: ${authError.message}`)
      continue
    }

    await supabase
      .from("profiles")
      .upsert({
        id: authData.user.id,
        email,
        nombre: inst.nombre,
        role: "auditor",
        active: true,
      })

    console.log(`OK   ${inst.user}@mercosur.local / ${PASSWORD}  (rol: auditor)`)
  }

  console.log("\nListo!")
}

main()

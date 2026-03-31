import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://tpafgmbhnucdiavvxbcg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYWZnbWJobnVjZGlhdnZ4YmNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyMDMyNSwiZXhwIjoyMDkwMTk2MzI1fQ.FL6WovR_X3L03JBjOI7oGdreZung9BetifnnhSLJWuI",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const empleados = [
  { legajo: 54, nombre: "ACOSTA ANGEL", doc: "33205114" },
  { legajo: 62, nombre: "ACOSTA JOEL EMANUEL", doc: "38849761" },
  { legajo: 48, nombre: "ARANCIBIA JULIO CESAR", doc: "35243859" },
  { legajo: 174, nombre: "AVALOS HUGO ALBERTO", doc: "30683337" },
  { legajo: 47, nombre: "CERBIN ADRIAN", doc: "22435580" },
  { legajo: 45, nombre: "CHURRUARIN OSCAR DANIEL", doc: "29259341" },
  { legajo: 28, nombre: "CORDONE LUIS DARIO", doc: "27937760" },
  { legajo: 29, nombre: "DAVALOS ARENA NICOLAS PABLO", doc: "94121351" },
  { legajo: 13, nombre: "ESCOBAR ROBERTO", doc: "22365794" },
  { legajo: 60, nombre: "FERNANDEZ LUCAS", doc: "27978965" },
  { legajo: 64, nombre: "FRIAS ANGEL ERMINDO", doc: "29095863" },
  { legajo: 55, nombre: "OLAZAGOITIA GABRIEL", doc: "34452286" },
  { legajo: 34, nombre: "RIVERO EZEQUIEL JORGE", doc: "32307039" },
  { legajo: 50, nombre: "RIVERO FEDERICO", doc: "36467534" },
  { legajo: 88, nombre: "RIVERO LAUREANO", doc: "28450149" },
  { legajo: 83, nombre: "RODRIGUEZ MARCELO", doc: "24667105" },
  { legajo: 35, nombre: "RODRIGUEZ WALTER GUSTAVO", doc: "25365516" },
  { legajo: 11, nombre: "SANDOVAL ANTONIO", doc: "20475105" },
  { legajo: 21, nombre: "SEQUEIRA HUMBERTO DAVID", doc: "32658032" },
  { legajo: 25, nombre: "SEQUEIRA WALTER DAMIAN", doc: "29772068" },
  { legajo: 140, nombre: "TEVES JORGE EZEQUIEL", doc: "37934203" },
  { legajo: 56, nombre: "TISEIRA HECTOR OSCAR", doc: "21488413" },
  { legajo: 18, nombre: "ZACARIAS JUAN CARLOS", doc: "25715965" },
  { legajo: 121, nombre: "ZACCO LORENZO", doc: "41071335" },
  { legajo: 65, nombre: "ZARATE RODOLFO ADRIAN", doc: "28673490" },
]

async function main() {
  console.log("Creating empleado users...\n")

  let ok = 0
  let fail = 0

  for (const emp of empleados) {
    const email = `${emp.doc}@mercosur.local`
    const password = emp.doc

    // 1. Create auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre: emp.nombre },
      })

    if (authError) {
      console.log(`SKIP ${emp.nombre} (${emp.doc}): ${authError.message}`)
      fail++
      continue
    }

    const userId = authData.user.id

    // 2. Update profile: set role=empleado and nombre
    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        email,
        nombre: emp.nombre,
        role: "empleado",
        active: true,
      })

    // 3. Link empleado record to profile
    await supabase
      .from("empleados")
      .update({ profile_id: userId })
      .eq("legajo", emp.legajo)

    console.log(`OK   ${emp.nombre} — usuario: ${emp.doc} / password: ${emp.doc}`)
    ok++
  }

  console.log(`\nDone: ${ok} created, ${fail} skipped`)
}

main()

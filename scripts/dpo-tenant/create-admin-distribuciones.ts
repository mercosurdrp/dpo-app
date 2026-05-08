import { createClient } from "@supabase/supabase-js"

const URL = "https://bvqmsrnrdrxprbggfziu.supabase.co"
const SERVICE_KEY = process.env.DEST_SERVICE_KEY!

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = "admin@mercosurdistribuciones.local"
const PASSWORD = "distribuciones2026"
const NOMBRE = "Admin Distribuciones"

async function main() {
  console.log("→ Creando admin user…")
  const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: NOMBRE },
  })
  if (authErr) {
    console.log("✗ auth:", authErr.message)
    return
  }
  console.log("✓ auth user:", auth.user.id)

  console.log("→ Creando profile admin…")
  const { error: profErr } = await supabase.from("profiles").upsert({
    id: auth.user.id,
    email: EMAIL,
    nombre: NOMBRE,
    role: "admin",
    active: true,
  })
  if (profErr) {
    console.log("✗ profile:", profErr.message)
    return
  }
  console.log("✓ profile admin")

  console.log("\n→ Creando storage buckets…")
  const buckets = [
    { id: "dpo-evidencia", name: "dpo-evidencia", public: false },
    { id: "reportes-seguridad", name: "reportes-seguridad", public: true },
    { id: "linea-etica", name: "linea-etica", public: true },
    { id: "sops", name: "sops", public: false },
    { id: "capacitaciones", name: "capacitaciones", public: false },
  ]
  for (const b of buckets) {
    const { error } = await supabase.storage.createBucket(b.id, { public: b.public })
    if (error && !error.message.includes("already exists")) {
      console.log(`  ✗ ${b.id}: ${error.message}`)
    } else {
      console.log(`  ✓ ${b.id}${b.public ? " (public)" : ""}`)
    }
  }

  console.log("\n============================================")
  console.log("CREDENCIALES ADMIN (guardalas):")
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  Rol:      admin`)
  console.log("============================================")
}

main().catch(console.error)

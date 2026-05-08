import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 200 })
  const u = users?.find((x) => x.email === "28@dpo.local")
  if (!u) {
    console.log("No user with email 28@dpo.local")
    return
  }
  console.log("Found user:", u.id, u.email)
  const { error } = await supabase.auth.admin.updateUserById(u.id, {
    password: "27937760",
    email_confirm: true,
  })
  if (error) {
    console.log("ERROR:", error.message)
    return
  }
  console.log("Password reset to 27937760")

  // Ensure profile is active and role empleado
  await supabase
    .from("profiles")
    .update({ role: "empleado", active: true, nombre: "CORDONE LUIS DARIO" })
    .eq("id", u.id)
  console.log("Profile updated")
}

main().catch(console.error)

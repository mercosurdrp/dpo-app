import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const userId = "037862e2-88be-4be1-ba33-901ec7a3df5c"
  const newEmail = "28@dpo.local"
  const newPassword = "27937760"

  const { error: authErr } = await supabase.auth.admin.updateUserById(userId, {
    email: newEmail,
    password: newPassword,
    email_confirm: true,
  })
  if (authErr) {
    console.log("Auth update ERROR:", authErr.message)
    return
  }
  console.log("Auth user actualizado:", newEmail, "/", newPassword)

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ email: newEmail })
    .eq("id", userId)
  if (profErr) {
    console.log("Profile update ERROR:", profErr.message)
    return
  }
  console.log("Profile.email actualizado a", newEmail)
}

main().catch(console.error)

/**
 * Limpia auth users huérfanos (sin row en profiles) para que el re-seed
 * pueda crear todo desde cero sin choque de emails duplicados.
 */
import { createClient } from "@supabase/supabase-js"

const URL = "https://bvqmsrnrdrxprbggfziu.supabase.co"
const SERVICE_KEY = process.env.DEST_SERVICE_KEY!

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  let page = 1
  let total = 0
  const huerfanos: { id: string; email: string | undefined }[] = []

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) {
      console.error("listUsers error:", error.message)
      return
    }
    total += data.users.length
    for (const u of data.users) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", u.id)
        .maybeSingle()
      if (!prof) {
        huerfanos.push({ id: u.id, email: u.email })
      }
    }
    if (data.users.length < 200) break
    page++
  }

  console.log(`Auth users totales: ${total}`)
  console.log(`Huerfanos (sin profile): ${huerfanos.length}`)
  for (const h of huerfanos) {
    const { error } = await supabase.auth.admin.deleteUser(h.id)
    if (error) {
      console.log(`  FAIL ${h.email}: ${error.message}`)
    } else {
      console.log(`  DEL  ${h.email}`)
    }
  }
}

main().catch(console.error)

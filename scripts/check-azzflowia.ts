import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: prof } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, active")
    .eq("email", "azzflowia@gmail.com")
    .maybeSingle()
  console.log("Profile azzflowia:", JSON.stringify(prof, null, 2))

  if (!prof) return
  const { data: prs } = await supabase
    .from("plan_responsables")
    .select("plan_id, rol")
    .eq("profile_id", prof.id)
  console.log(`\nResponsabilidades: ${prs?.length ?? 0}`)
  if (prs && prs.length > 0) {
    for (const pr of prs) {
      const { data: plan } = await supabase
        .from("planes_accion")
        .select("descripcion, estado, fecha_limite")
        .eq("id", pr.plan_id)
        .single()
      console.log(`  - [${pr.rol}] ${plan?.descripcion?.slice(0, 60)} (${plan?.estado}, ${plan?.fecha_limite})`)
    }
  }
}

main().catch(console.error)

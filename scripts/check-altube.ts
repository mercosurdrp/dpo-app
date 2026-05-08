import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, active")
    .ilike("nombre", "%altube%")
  console.log("Profiles:", JSON.stringify(profs, null, 2))

  for (const p of profs ?? []) {
    const { data: prs } = await supabase
      .from("plan_responsables")
      .select("plan_id, rol")
      .eq("profile_id", p.id)
    console.log(`\nResponsabilidades de "${p.nombre}" [${p.id}]: ${prs?.length ?? 0}`)
    for (const pr of prs ?? []) {
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

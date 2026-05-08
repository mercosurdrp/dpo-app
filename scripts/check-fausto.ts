import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: fausto } = await supabase
    .from("profiles")
    .select("id, nombre, email, role, active")
    .ilike("nombre", "%fausto%")
  console.log("Profiles Fausto:", JSON.stringify(fausto, null, 2))

  if (!fausto || fausto.length === 0) return
  for (const f of fausto) {
    const { data: prs, error } = await supabase
      .from("plan_responsables")
      .select("plan_id, rol, asignado_at")
      .eq("profile_id", f.id)
    console.log(`\nResponsabilidades de ${f.nombre} [${f.id}]:`)
    if (error) console.log("  ERROR:", error.message)
    console.log(`  ${prs?.length ?? 0} entries`)
    if (prs && prs.length > 0) {
      for (const pr of prs) {
        const { data: plan } = await supabase
          .from("planes_accion")
          .select("descripcion, estado, fecha_limite")
          .eq("id", pr.plan_id)
          .single()
        console.log(
          `  - [${pr.rol}] ${plan?.descripcion?.slice(0, 60)} (estado: ${plan?.estado}, vence: ${plan?.fecha_limite})`,
        )
      }
    }
  }
}

main().catch(console.error)

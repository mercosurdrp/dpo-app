/**
 * Consolida las dos cuentas de Fausto:
 * - Renombra "Admin DPO" → "Fausto Admin" (profile id 0f67f4f4...)
 * - Mueve plan_responsables del profile empleado "Fausto Azzaretti"
 *   (e579be0a...) al profile admin
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/consolidar-fausto.ts          (dry-run)
 *   npx tsx --env-file=.env.local scripts/consolidar-fausto.ts --apply  (escribe)
 */

import { createClient } from "@supabase/supabase-js"

const ADMIN_ID = "0f67f4f4-28b1-446a-8561-9ce9f731d794"   // azzflowia@gmail.com (Admin DPO)
const EMPL_ID = "e579be0a-64ef-4572-8a55-c0fbfe03e57f"    // fazzaretti@... (Fausto Azzaretti empleado)
const NUEVO_NOMBRE = "Fausto Admin"
const APPLY = process.argv.includes("--apply")

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`)

  // Estado actual
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, nombre, email, role")
    .eq("id", ADMIN_ID)
    .single()
  const { data: empl } = await supabase
    .from("profiles")
    .select("id, nombre, email, role")
    .eq("id", EMPL_ID)
    .single()

  console.log(`Admin actual:    "${admin?.nombre}" (${admin?.email}, ${admin?.role})`)
  console.log(`Empleado actual: "${empl?.nombre}" (${empl?.email}, ${empl?.role})`)

  const { data: prsEmpl } = await supabase
    .from("plan_responsables")
    .select("plan_id, rol")
    .eq("profile_id", EMPL_ID)
  console.log(`\nResponsabilidades del empleado a mover: ${prsEmpl?.length ?? 0}`)

  // Detectar conflictos: ¿el admin ya está en alguno de esos planes?
  const planIds = (prsEmpl ?? []).map((r) => r.plan_id)
  const { data: prsAdmin } = await supabase
    .from("plan_responsables")
    .select("plan_id, rol")
    .eq("profile_id", ADMIN_ID)
    .in("plan_id", planIds)
  const conflictos = new Set((prsAdmin ?? []).map((r) => r.plan_id))
  if (conflictos.size > 0) {
    console.log(`⚠️  Conflictos (admin ya está en estos planes, esos NO se mueven):`)
    for (const id of conflictos) console.log(`   ${id}`)
  }

  console.log(`\n=== Acciones ===`)
  console.log(`1. UPDATE profiles SET nombre='${NUEVO_NOMBRE}' WHERE id='${ADMIN_ID}'`)
  console.log(`2. UPDATE plan_responsables SET profile_id='${ADMIN_ID}' WHERE profile_id='${EMPL_ID}' (excepto conflictos)`)

  if (!APPLY) {
    console.log("\n(dry-run, no se escribe — corré con --apply)")
    return
  }

  // 1) Rename admin
  const { error: e1 } = await supabase
    .from("profiles")
    .update({ nombre: NUEVO_NOMBRE })
    .eq("id", ADMIN_ID)
  if (e1) throw e1
  console.log(`✓ Renombrado a "${NUEVO_NOMBRE}"`)

  // 2) Move responsabilidades, evitando conflictos
  const moverIds = planIds.filter((id) => !conflictos.has(id))
  if (moverIds.length > 0) {
    const { error: e2 } = await supabase
      .from("plan_responsables")
      .update({ profile_id: ADMIN_ID })
      .eq("profile_id", EMPL_ID)
      .in("plan_id", moverIds)
    if (e2) throw e2
    console.log(`✓ Movidas ${moverIds.length} responsabilidades`)
  } else {
    console.log("(nada que mover)")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

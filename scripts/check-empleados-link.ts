import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const NOMBRES = ["OVEJERO", "SELENZO", "GALVEZ"]

async function main() {
  for (const nombre of NOMBRES) {
    console.log(`\n=== Buscando "${nombre}" ===`)

    const { data: emps } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, numero_id, profile_id, activo, sector")
      .ilike("nombre", `%${nombre}%`)

    if (!emps || emps.length === 0) {
      console.log("✗ No encontrado en empleados")
      continue
    }

    for (const emp of emps) {
      console.log(`Empleado:`)
      console.log(`  legajo: ${emp.legajo}`)
      console.log(`  nombre: ${emp.nombre}`)
      console.log(`  numero_id (DNI): ${emp.numero_id}`)
      console.log(`  activo: ${emp.activo}`)
      console.log(`  sector: ${emp.sector}`)
      console.log(`  profile_id: ${emp.profile_id ?? "(NULL — sin vincular)"}`)

      // Buscar profile correspondiente
      if (emp.profile_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, role, full_name, active")
          .eq("id", emp.profile_id)
          .maybeSingle()
        console.log(`  Profile vinculado:`, profile ?? "(no existe)")
      }

      // Buscar usuario auth por email = legajo@dpo.local
      const expectedEmail = `${emp.legajo}@dpo.local`
      const { data: authUsers } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      const authUser = authUsers?.users?.find((u) => u.email === expectedEmail)
      if (authUser) {
        console.log(`  Auth user (${expectedEmail}): id=${authUser.id}`)
        if (emp.profile_id !== authUser.id) {
          console.log(`  ⚠️  profile_id (${emp.profile_id}) != auth.id (${authUser.id})`)
        } else {
          console.log(`  ✓ profile_id coincide con auth.id`)
        }
      } else {
        console.log(`  ✗ No hay usuario auth con email ${expectedEmail}`)
      }
    }
  }
}

main().catch(console.error)

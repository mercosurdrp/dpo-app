/**
 * Promueve un usuario existente a `admin_rrhh` en el Supabase apuntado por
 * env vars. Corré una vez por tenant (Pampeana y Misiones), cambiando
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY entre runs.
 *
 * Uso:
 *   SUPABASE_URL=https://<proj>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
 *   ADMIN_EMAIL=azzflowia@gmail.com \
 *   npx tsx scripts/promote-admin-rrhh.ts
 *
 * Valores por defecto:
 *   ADMIN_EMAIL = azzflowia@gmail.com
 *   ROLE        = admin_rrhh   (override con TARGET_ROLE=admin)
 */

import { createClient } from "@supabase/supabase-js"

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.ADMIN_EMAIL ?? "azzflowia@gmail.com"
const ROLE = (process.env.TARGET_ROLE ?? "admin_rrhh") as
  | "admin"
  | "admin_rrhh"
  | "supervisor"

if (!URL || !KEY) {
  console.error("✗ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`→ Tenant: ${URL}`)
  console.log(`→ Buscando profile por email: ${EMAIL}`)

  const { data: profile, error: errProf } = await supabase
    .from("profiles")
    .select("id, email, nombre, role, active, empleado_id")
    .eq("email", EMAIL)
    .maybeSingle()

  if (errProf) {
    console.error("✗ Error consultando profiles:", errProf.message)
    process.exit(1)
  }

  if (!profile) {
    console.error(
      `✗ No existe ningún profile con email "${EMAIL}" en este tenant.`
    )
    console.error(
      "  Si todavía no creaste tu cuenta web acá, hacelo primero (login normal)"
    )
    console.error("  o pedí que te genere un script create-admin-rrhh.")
    process.exit(1)
  }

  console.log(
    `✓ Encontrado: id=${profile.id}, role actual=${profile.role}, active=${profile.active}`
  )

  // Si ya tiene el rol pedido y está activo, no hace nada destructivo.
  if (profile.role === ROLE && profile.active) {
    console.log(`✓ El usuario ya tiene rol "${ROLE}" y está activo. Nada que hacer.`)
  } else {
    const { error: errUpd } = await supabase
      .from("profiles")
      .update({ role: ROLE, active: true })
      .eq("id", profile.id)

    if (errUpd) {
      console.error("✗ Error actualizando role:", errUpd.message)
      process.exit(1)
    }
    console.log(`✓ Profile actualizado: role="${ROLE}", active=true`)
  }

  // Intento de link a un empleado por nombre/email para que la cuenta también
  // pueda solicitar licencias (el flujo de empleado requiere empleado_id).
  if (!profile.empleado_id) {
    console.log("→ Intentando linkear a un empleado existente…")
    const { data: empleados } = await supabase
      .from("empleados")
      .select("id, legajo, nombre, email_personal")
      .or(
        `email_personal.eq.${EMAIL},nombre.ilike.%${EMAIL.split("@")[0]}%`
      )
      .limit(5)

    if (empleados && empleados.length === 1) {
      const emp = empleados[0]
      const { error: errLink } = await supabase
        .from("profiles")
        .update({ empleado_id: emp.id })
        .eq("id", profile.id)
      if (errLink) {
        console.warn("  ! No se pudo linkear empleado:", errLink.message)
      } else {
        console.log(
          `✓ Linkeado a empleado: legajo=${emp.legajo}, nombre="${emp.nombre}"`
        )
      }
    } else if (empleados && empleados.length > 1) {
      console.log(
        `  ! ${empleados.length} candidatos. No linkeo automáticamente; usá /admin/mapeo-empleados.`
      )
    } else {
      console.log("  · Sin empleado coincidente. Lo podés linkear desde /admin/usuarios.")
    }
  } else {
    console.log(`✓ Ya está linkeado a empleado_id=${profile.empleado_id}`)
  }

  console.log("\n============================================")
  console.log(`Listo. Usuario ${EMAIL} ahora es ${ROLE} en ${URL}`)
  console.log("============================================")
}

main().catch((err) => {
  console.error("✗ Error inesperado:", err)
  process.exit(1)
})

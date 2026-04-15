import { createClient } from "@supabase/supabase-js"
import fs from "fs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  // Chequear si ya existen
  const { error: errCheck } = await supabase
    .from("foxtrot_delivery_attempts")
    .select("id", { head: true, count: "exact" })

  if (!errCheck) {
    console.log("✓ Tabla foxtrot_delivery_attempts ya existe")
    return
  }

  console.log("Tabla no existe. Correr la migración 022 en Supabase SQL editor.")
  const sql = fs.readFileSync("supabase/migrations/022_foxtrot_detalle.sql", "utf8")
  console.log("\n--- SQL a correr ---")
  console.log(sql)
}
main().catch(console.error)

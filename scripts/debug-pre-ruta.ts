import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const hoy = new Date().toISOString().slice(0, 10)
  console.log("hoy (UTC slice):", hoy)

  const { data: marcas } = await supabase
    .from("asistencia_marcas")
    .select("legajo,fecha_marca,tipo_marca")
    .gte("fecha_marca", `${hoy}T00:00:00`)
    .lte("fecha_marca", `${hoy}T23:59:59`)
    .order("fecha_marca", { ascending: true })
    .limit(20)
  console.log("\nMarcas hoy (rango naive):", marcas?.length, "filas")
  for (const m of marcas || []) console.log(" ", m)

  const { data: marcasRaw } = await supabase
    .from("asistencia_marcas")
    .select("legajo,fecha_marca,tipo_marca")
    .order("fecha_marca", { ascending: false })
    .limit(5)
  console.log("\nÚltimas 5 marcas sin filtro:", marcasRaw?.length)
  for (const m of marcasRaw || []) console.log(" ", m)

  const { data: reuniones } = await supabase
    .from("reunion_preruta")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(3)
  console.log("\nÚltimas 3 reuniones:", reuniones?.length)
  for (const r of reuniones || []) console.log(" ", r)
}
main().catch(console.error)

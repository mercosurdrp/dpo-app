import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  // Chequear tablas
  for (const tbl of ["dpo_archivos", "dpo_archivo_versiones", "dpo_actividad"]) {
    const { error, count } = await supabase
      .from(tbl)
      .select("*", { count: "exact", head: true })
    console.log(`${tbl}: ${error ? "ERROR: " + error.message : `OK (${count} filas)`}`)
  }

  // Chequear bucket
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets()
  if (bErr) console.log("listBuckets ERROR:", bErr.message)
  else {
    const dpo = buckets?.find((b) => b.id === "dpo-evidencia")
    console.log(`bucket dpo-evidencia: ${dpo ? "OK" : "NO EXISTE"}`)
  }
}
main().catch(console.error)

import { createClient } from "@supabase/supabase-js"

// Usa anon key como lo haría un usuario normal (no service role),
// así testeamos las RLS policies del bucket.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  // 1. Login con un usuario de prueba (usuario admin)
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: "azzflowia@gmail.com",
    password: process.env.TEST_PASSWORD ?? "",
  })
  if (authErr) {
    console.log("Login fail (probar upload con anon):", authErr.message)
  } else {
    console.log("Logged in OK")
  }

  // 2. Intentar upload a storage
  const buffer = Buffer.from("contenido de prueba")
  const path = `test/test-${Date.now()}.txt`
  const { error: upErr } = await supabase.storage
    .from("dpo-evidencia")
    .upload(path, buffer, { contentType: "text/plain" })

  if (upErr) {
    console.log("Upload ERROR:", upErr.message)
    console.log("  → Falta la policy 'dpo_evidencia_insert' en storage.objects")
  } else {
    console.log("Upload OK →", path)
    // Limpiar
    await supabase.storage.from("dpo-evidencia").remove([path])
  }

  // 3. List buckets check policies implícitas
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
  if (listErr) console.log("listBuckets error:", listErr.message)
  else console.log(`listBuckets OK (${buckets?.length} buckets)`)
}
main().catch(console.error)

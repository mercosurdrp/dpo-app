import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  const { data: sugs, error } = await supabase
    .from("sugerencias")
    .select("id, titulo, descripcion, tipo, estado, prioridad, modulo, creado_por, created_at")
    .order("created_at", { ascending: false })

  if (error) { console.log("Error:", error.message); return }
  if (!sugs || sugs.length === 0) { console.log("(no hay sugerencias)"); return }

  for (const s of sugs) {
    const { data: prof } = await supabase
      .from("profiles").select("nombre").eq("id", s.creado_por).maybeSingle()
    console.log("─".repeat(80))
    console.log(`ID: ${s.id}`)
    console.log(`Título: ${s.titulo}`)
    console.log(`Tipo: ${s.tipo}  Estado: ${s.estado}  Prioridad: ${s.prioridad}`)
    console.log(`Módulo: ${s.modulo ?? "-"}`)
    console.log(`Autor: ${prof?.nombre ?? s.creado_por}`)
    console.log(`Creado: ${s.created_at}`)
    console.log(`Descripción: ${s.descripcion}`)
  }
}

main().catch(console.error)

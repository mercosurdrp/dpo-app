import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main() {
  // Traer todas las preguntas, agruparlas por pilar y filtrar las que mencionan 5S
  const { data: pilares } = await supabase
    .from("pilares")
    .select("id, nombre, orden")
    .order("orden")

  if (!pilares) return

  for (const pilar of pilares) {
    const { data: bloques } = await supabase
      .from("bloques")
      .select("id, nombre, orden")
      .eq("pilar_id", pilar.id)
      .order("orden")

    const hits: Array<{
      bloque: string
      numero: string
      texto: string
      ctx: string
      campo: string
    }> = []

    for (const bloque of bloques ?? []) {
      const { data: preguntas } = await supabase
        .from("preguntas")
        .select("numero, texto, guia, requerimiento, puntaje_criterio")
        .eq("bloque_id", bloque.id)

      for (const p of preguntas ?? []) {
        const fields: Array<{ key: string; val: string }> = [
          { key: "texto", val: p.texto ?? "" },
          { key: "guia", val: p.guia ?? "" },
          { key: "requerimiento", val: p.requerimiento ?? "" },
          { key: "puntaje_criterio", val: JSON.stringify(p.puntaje_criterio ?? {}) },
        ]
        for (const f of fields) {
          if (/5\s?S\b|cinco S/i.test(f.val)) {
            // extract short context around "5S"
            const idx = f.val.search(/5\s?S\b|cinco S/i)
            const start = Math.max(0, idx - 80)
            const end = Math.min(f.val.length, idx + 200)
            hits.push({
              bloque: bloque.nombre,
              numero: p.numero,
              texto: p.texto?.substring(0, 120) ?? "",
              ctx: f.val.substring(start, end).replace(/\s+/g, " "),
              campo: f.key,
            })
          }
        }
      }
    }

    if (hits.length === 0) continue
    console.log(`\n${"=".repeat(80)}`)
    console.log(`PILAR ${pilar.orden}: ${pilar.nombre}  (${hits.length} menciones)`)
    console.log("=".repeat(80))
    for (const h of hits) {
      console.log(`\n  📍 [${h.numero}] ${h.bloque}`)
      console.log(`     Pregunta: ${h.texto}${h.texto.length >= 120 ? "..." : ""}`)
      console.log(`     Campo: ${h.campo}`)
      console.log(`     Contexto: ...${h.ctx}...`)
    }
  }
}

main().catch(console.error)

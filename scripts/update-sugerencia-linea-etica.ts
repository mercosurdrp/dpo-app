import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const COMENTARIO =
  "✅ Implementado (pendiente deploy).\n\n" +
  "• Nuevo módulo /compliance/linea-etica con listado + detalle de denuncias.\n" +
  "• Formulario PÚBLICO anónimo en /linea-etica (sin login — apto para QR del comedor).\n" +
  "• Identificación 100% opcional (checkbox al final del form).\n" +
  "• Soporta fotos, audio y video (max 10MB c/u) en bucket Supabase Storage.\n" +
  "• Campos: tipo (8 categorías: conducta indebida, acoso, discriminación, corrupción, fraude, conflicto de interés, represalia, otro), descripción, fecha del hecho, lugar, área, localidad.\n" +
  "• Trigger notifica a todos los usuarios cuando se carga una denuncia nueva.\n" +
  "• En cada denuncia: cambio de estado (nueva → en revisión → en tratamiento → cerrada), resumen del tratamiento y carga de evidencia de tratamiento.\n" +
  "• Botón \"Crear plan de acción\" ancla el plan a la pregunta 1.1 Compliance y queda vinculado a la denuncia.\n" +
  "• En /evidencia/gestion/1-1 (Compliance) aparece una tarjeta con contadores y link directo al listado.\n" +
  "• Entrada en sidebar \"Línea Ética\" oculta para rol empleado.\n\n" +
  "QR para comedor:\n" +
  "• Script `scripts/generate-qr-linea-etica.ts` genera PNG 1200x1200 + PDF A4 listo para imprimir.\n" +
  "• URL del QR: https://dpo-app-self.vercel.app/linea-etica\n\n" +
  "Pendiente: ejecutar migration 030_linea_etica.sql en Supabase + correr el script del QR para imprimir."

async function main() {
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, nombre")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle()

  if (!admin) {
    console.log("✗ No se encontró un profile admin")
    return
  }
  console.log(`Autor: ${admin.nombre} (${admin.id})\n`)

  const { data: sugerencias, error } = await supabase
    .from("sugerencias")
    .select("id, titulo, estado, modulo")
    .or("titulo.ilike.%linea etica%,titulo.ilike.%línea ética%,titulo.ilike.%Linea Etica%")

  if (error) {
    console.log("✗ Error buscando sugerencias:", error.message)
    return
  }

  if (!sugerencias || sugerencias.length === 0) {
    console.log("✗ No se encontró sugerencia 'Línea Ética'")
    return
  }

  for (const s of sugerencias) {
    console.log(`─── ${s.titulo} (estado actual: ${s.estado}) ───`)

    const { error: updErr } = await supabase
      .from("sugerencias")
      .update({ estado: "en_testeo", modulo: "Compliance / Línea Ética" })
      .eq("id", s.id)

    if (updErr) {
      console.log("  ✗ Error update:", updErr.message)
      continue
    }
    console.log("  ✓ estado → en_testeo, módulo → Compliance / Línea Ética")

    const { error: comErr } = await supabase
      .from("sugerencia_comentarios")
      .insert({
        sugerencia_id: s.id,
        autor_id: admin.id,
        texto: COMENTARIO,
      })

    if (comErr) {
      console.log("  ✗ Error comentario:", comErr.message)
      continue
    }
    console.log("  ✓ Comentario agregado\n")
  }
}

main().catch(console.error)

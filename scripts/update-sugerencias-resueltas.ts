import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface Update {
  id: string
  titulo: string
  estado_objetivo: "en_testeo"
  modulo?: string
  comentario: string
}

const UPDATES: Update[] = [
  {
    id: "1acf73af-c4dc-4bcb-8916-7a75affd7da9",
    titulo: "Evidencias en puntos DPO",
    estado_objetivo: "en_testeo",
    modulo: "Planes / Evidencia DPO",
    comentario:
      "✅ Implementado en commit 4373d48 (deploy 17/04).\n\n" +
      "• Tabla M2M dpo_archivo_planes para vincular evidencias a planes.\n" +
      "• En el detalle del plan de acción aparece nueva sección \"Evidencias DPO vinculadas\".\n" +
      "• Botón \"+ Vincular evidencia\" abre buscador (por título / archivo / categoría).\n" +
      "• Por cada evidencia: descargar 📥 o desvincular 🗑️.\n" +
      "• Para subir nuevas, link directo a /evidencia desde el dialog.\n\n" +
      "Pendiente para v2: subir archivo nuevo desde adentro del plan en un solo paso.",
  },
  {
    id: "bcff0d87-4b76-4bd4-8eb7-657bcd97a8b2",
    titulo: "Capacitaciones (80% para aprobar)",
    estado_objetivo: "en_testeo",
    comentario:
      "✅ Implementado en commit 7b0f4a9 (deploy 17/04).\n\n" +
      "• Umbral de aprobación cambiado de 60% → 80% en server (submitExamen) y UI del examen.\n" +
      "• Notas históricas recalculadas con SQL: las que estaban entre 60-79% ahora figuran como desaprobadas.\n" +
      "• Sumado: el admin ya NO puede editar nota/resultado a mano. Solo se setean al rendir el examen.\n" +
      "• Sumado: empleados desaprobados ven botón \"Rendir nuevamente\" + historial de intentos (commit d57b353).",
  },
  {
    id: "934d7f29-7122-4346-843b-a50cabbaf4fb",
    titulo: "ERROR (3 operarios fichadas/capacitaciones)",
    estado_objetivo: "en_testeo",
    comentario:
      "✅ Resuelto.\n\n" +
      "Causa: cada uno de los 3 (Hugo Ovejero, Pablo Selenzo, Ruben Galvez) tenía 2 registros de empleado: uno viejo con login pero sin datos, y otro nuevo con datos pero sin login. El sistema los matcheaba contra el viejo.\n\n" +
      "Fix:\n" +
      "• Se creó la fila profiles para los 3 auth users.\n" +
      "• Se vinculó el empleado nuevo (con datos) al auth.uid del login.\n" +
      "• Se desvinculó y desactivó el empleado viejo duplicado.\n\n" +
      "Credenciales:\n" +
      "• Hugo Ovejero — usuario 180@dpo.local — pass 43907801\n" +
      "• Pablo Selenzo — usuario 173@dpo.local — pass 40189408\n" +
      "• Ruben Galvez — usuario 159@dpo.local — pass 36467481\n\n" +
      "Pedirles que cierren sesión y vuelvan a entrar.",
  },
  {
    id: "745eb808-e5a5-436b-8e7a-8d64883bd46a",
    titulo: "Formulario registro actos inseguros",
    estado_objetivo: "en_testeo",
    comentario:
      "✅ Implementado en commits 9e6d9ab + d893d7e (deploy 17/04).\n\n" +
      "• Nuevo módulo /reportes-seguridad con 5 tipos: accidente, incidente, acto inseguro, ruta de riesgo, acto seguro.\n" +
      "• Para empleados: card roja en /mis-capacitaciones → abre /reportar-seguridad con el formulario inline (sin acceso al listado completo).\n" +
      "• Soporta foto / audio / video (max 10MB c/u) en bucket Supabase Storage.\n" +
      "• Notificaciones automáticas a TODOS los usuarios cuando se carga un reporte (campana en sidebar con badge).\n" +
      "• Cada usuario puede borrar sus propias notificaciones.",
  },
]

async function main() {
  // Buscar un profile admin para usar como autor de los comentarios
  const { data: admin } = await supabase
    .from("profiles")
    .select("id, nombre")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle()

  if (!admin) {
    console.log("✗ No se encontró un profile admin para usar como autor de comentarios")
    return
  }
  console.log(`Usando como autor de comentarios: ${admin.nombre} (${admin.id})\n`)

  for (const u of UPDATES) {
    console.log(`─── ${u.titulo} ───`)

    const updatePayload: Record<string, string> = { estado: u.estado_objetivo }
    if (u.modulo) updatePayload.modulo = u.modulo

    const { error: updErr } = await supabase
      .from("sugerencias")
      .update(updatePayload)
      .eq("id", u.id)
    if (updErr) { console.log("  ✗ Error update:", updErr.message); continue }
    console.log(`  ✓ estado → ${u.estado_objetivo}${u.modulo ? `, módulo → "${u.modulo}"` : ""}`)

    const { error: comErr } = await supabase
      .from("sugerencia_comentarios")
      .insert({
        sugerencia_id: u.id,
        autor_id: admin.id,
        texto: u.comentario,
      })
    if (comErr) { console.log("  ✗ Error comentario:", comErr.message); continue }
    console.log(`  ✓ Comentario agregado`)
    console.log()
  }
}

main().catch(console.error)

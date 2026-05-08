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

const COMMIT_PRINCIPAL = "bce25aa"
const COMMIT_NAV_EMPLEADO = "dbac825"
const FECHA_DEPLOY = "25/04/2026"

const UPDATES: Update[] = [
  {
    id: "23c45f1c-9e27-472a-abe2-c4343e357cc3",
    titulo: "Plan de accion en puntos de dPO (multi-responsables)",
    estado_objetivo: "en_testeo",
    modulo: "Planes / Plan de Acción",
    comentario:
      `✅ Implementado en commit ${COMMIT_PRINCIPAL} (deploy ${FECHA_DEPLOY}).\n\n` +
      "• Tabla M2M plan_responsables (plan ↔ profile, con rol).\n" +
      "• En el detalle del plan aparece nueva sección \"Responsables\" con:\n" +
      "   - Botón \"+ Agregar responsable\" → buscador con autocompletado.\n" +
      "   - Filtra solo perfiles con rol admin/auditor (los que pueden gestionar planes).\n" +
      "   - Cada chip muestra el nombre + permite quitar (✕) o promover a Principal (👑).\n" +
      "• Solo puede haber UN responsable principal por plan (constraint en DB).\n" +
      "• Backfill ejecutado: matché por nombre exacto + fuzzy todos los planes existentes.\n\n" +
      "⚠️ Detectados 2 perfiles duplicados (Esteban Altube, Sebastian Roselli) — pendiente unificar.",
  },
  {
    id: "bb4265f2-af7b-4b82-a869-611c2b82c58b",
    titulo: "Plan de accion (cierre + reprogramación)",
    estado_objetivo: "en_testeo",
    modulo: "Planes / Plan de Acción",
    comentario:
      `✅ Implementado en commit ${COMMIT_PRINCIPAL} (deploy ${FECHA_DEPLOY}).\n\n` +
      "• Botón \"Reprogramar\" en el detalle del plan abre dialog con:\n" +
      "   - 3 presets: +1 semana / +1 mes / Personalizado (date picker).\n" +
      "   - Campo \"Motivo\" opcional.\n" +
      "   - Si el plan estaba completado, vuelve a \"en progreso\" automáticamente.\n" +
      "• Cada reprogramación queda registrada en la tabla plan_reprogramaciones.\n" +
      "• Nueva sección \"Historial de reprogramaciones\" muestra fecha anterior → nueva, motivo, autor.\n" +
      "• Botón \"Cerrar plan\" abre dialog inteligente:\n" +
      "   - Si hay evidencias vinculadas → cierre directo.\n" +
      "   - Si no hay evidencias y evidencia_obligatoria=true:\n" +
      "       · Admin: checkbox \"Cerrar sin evidencia\" + motivo obligatorio.\n" +
      "       · No admin: bloqueado con mensaje rojo.",
  },
  {
    id: "fe6c4f30-e346-4072-a396-66e70b294734",
    titulo: "Planes de accion - Tareas (vista consolidada Teams)",
    estado_objetivo: "en_testeo",
    modulo: "Mis Tareas",
    comentario:
      `✅ Implementado en commits ${COMMIT_PRINCIPAL} + ${COMMIT_NAV_EMPLEADO} (deploy ${FECHA_DEPLOY}).\n\n` +
      "• Nueva ruta /mis-tareas accesible desde el sidebar (icono ClipboardList).\n" +
      "• Muestra TODAS las tareas donde el usuario logueado está como responsable (principal o coresponsable).\n" +
      "• 4 stat cards arriba: Total / Vencidas / Esta semana / Este mes.\n" +
      "• Filtros chip: todas / pendientes / en progreso / completadas / vencidas.\n" +
      "• Lista ordenada: vencidas primero, luego por fecha de vencimiento ascendente.\n" +
      "• Cada card muestra: descripción, pilar (badge color), fecha límite (rojo/naranja/gris según urgencia), estado, mi rol (👑 principal / 👥 coresponsable), evidencias vinculadas, link a detalle.\n" +
      "• Empleados también acceden: nuevo header con tabs (Capacitaciones / Mis tareas / Reportar / Vehículos).",
  },
  {
    id: "efade5ce-6f71-4a91-8e65-399bae2f5e78",
    titulo: "Carga de tareas (supervisor → personal con evidencia)",
    estado_objetivo: "en_testeo",
    modulo: "Planes / Plan de Acción",
    comentario:
      `✅ Implementado en commit ${COMMIT_PRINCIPAL} (deploy ${FECHA_DEPLOY}).\n\n` +
      "• Cualquier admin/auditor (= supervisor) puede asignar planes a empleados via la nueva sección Responsables.\n" +
      "• Flag evidencia_obligatoria=TRUE por defecto en todo plan: el responsable NO puede marcar como cerrado sin subir evidencia (salvo admin con motivo justificado).\n" +
      "• El empleado asignado ve la tarea en /mis-tareas, ordenada por vencimiento.\n" +
      "• Puede subir evidencia desde el detalle del plan + cerrar el plan cuando termine.\n" +
      "• RLS configurado: el responsable puede actualizar progreso, notas y estado de SUS planes únicamente.\n\n" +
      "Pendiente menor: switch \"evidencia obligatoria\" desde la UI de admin (hoy se setea por defecto a TRUE en todos los planes).",
  },
]

async function main() {
  // Usar Fausto Admin (azzflowia) como autor
  const { data: autor } = await supabase
    .from("profiles")
    .select("id, nombre")
    .eq("email", "azzflowia@gmail.com")
    .maybeSingle()

  if (!autor) {
    console.log("✗ No se encontró el profile de azzflowia@gmail.com")
    return
  }
  console.log(`Autor de comentarios: ${autor.nombre} (${autor.id})\n`)

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
        autor_id: autor.id,
        texto: u.comentario,
      })
    if (comErr) { console.log("  ✗ Error comentario:", comErr.message); continue }
    console.log(`  ✓ Comentario agregado`)
    console.log()
  }
}

main().catch(console.error)

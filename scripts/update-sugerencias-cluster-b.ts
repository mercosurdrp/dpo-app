/**
 * update-sugerencias-cluster-b.ts
 *
 * Marca las 2 sugerencias del Cluster B (Roselli — Evidencia DPO) como "en_testeo"
 * y agrega un comentario técnico explicando lo implementado.
 *
 * Sugerencias incluidas:
 *   1. 7ec1ea6d — "Archivos Subidos" (widget en home del dashboard)
 *   2. 2e3c0251 — "Archivos subidos" (sobrescribir versión visible en UI)
 *
 * Uso:
 *   bunx tsx scripts/update-sugerencias-cluster-b.ts            # dry-run (default)
 *   bunx tsx scripts/update-sugerencias-cluster-b.ts --apply    # ejecuta los UPDATEs/INSERTs
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en el entorno.
 */
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")

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

// Reemplazar tras hacer el commit del Cluster B.
const COMMIT_PRINCIPAL = "<COMMIT_HASH>"
const FECHA_DEPLOY = "25/04/2026"

const UPDATES: Update[] = [
  {
    id: "7ec1ea6d-fbc8-4a92-96fd-2a1b89a6d289",
    titulo: "Archivos Subidos (mostrar en home del dashboard)",
    estado_objetivo: "en_testeo",
    modulo: "Evidencia DPO / Home",
    comentario:
      `✅ Implementado en commit ${COMMIT_PRINCIPAL} (deploy ${FECHA_DEPLOY}).\n\n` +
      "• Nuevo widget en la home del dashboard que lista TODOS los puntos DPO oficiales (de la tabla preguntas), aunque todavía no tengan archivos cargados.\n" +
      "• Cada fila muestra: pilar + número de punto, título, cantidad de archivos subidos, último archivo (con fecha relativa) y link directo a la página del punto.\n" +
      "• Stats arriba del widget: Total de archivos / Puntos con archivos / Último archivo subido (fecha + título).\n" +
      "• Filtro por nombre/título para buscar puntos específicos sin scrollear.\n" +
      "• Componente nuevo: `src/components/dashboard/dpo-archivos-resumen.tsx`.\n" +
      "• Data source: `getResumenPuntos()` en `src/actions/dpo-evidencia.ts` — devuelve `DpoPuntoResumen[]` con titulo, total_archivos, ultimo_archivo, total_actividad, ultima_actividad.",
  },
  {
    id: "2e3c0251-2fcd-4262-aba1-498afa5d3687",
    titulo: "Archivos subidos (sobrescribir versión)",
    estado_objetivo: "en_testeo",
    modulo: "Evidencia DPO",
    comentario:
      `✅ Visibilidad mejorada en commit ${COMMIT_PRINCIPAL} (deploy ${FECHA_DEPLOY}).\n\n` +
      "ℹ️ Aclaración: la sobrescritura de versión YA existía técnicamente vía la server action `registerNuevaVersion` y el dialog \"Subir nueva versión\", pero estaba escondida dentro del Dialog \"Historial de versiones\" — el usuario no la encontraba.\n\n" +
      "Mejoras de UX aplicadas en `src/app/(dashboard)/evidencia/[pilar]/[punto]/evidencia-punto-client.tsx`:\n" +
      "• Botón directo \"Nueva versión\" en la card de cada archivo (ya no hay que abrir el historial primero).\n" +
      "• Badge prominente con la versión actual del archivo (ej. `v3`) visible en la card.\n" +
      "• Aviso claro en el dialog que indica qué archivo se está versionando y deja explícito que el archivo anterior queda como historial — no se borra.\n\n" +
      "Comportamiento técnico (sin cambios — solo más visible):\n" +
      "• Subir nueva versión bumpea `current_version` y actualiza `current_file_path` / `current_file_size` / `file_name` / `file_ext` / `mime_type` en `dpo_archivos`.\n" +
      "• El archivo anterior se preserva en `dpo_archivo_versiones` (historial completo: version, file_path, file_name, file_size, notas, uploaded_by).\n" +
      "• La \"versión actual\" siempre apunta al último upload.\n" +
      "• Queda asentado en `dpo_actividad` con tipo `archivo_version_nueva`.",
  },
]

async function main() {
  console.log(APPLY ? "⚙️  Modo: APPLY (escribe en DB)" : "🧪 Modo: DRY-RUN (no escribe). Pasá --apply para ejecutar.")
  console.log()

  // Usar Fausto Admin (azzflowia) como autor — mismo criterio que cluster A.
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
    console.log(`  id: ${u.id}`)
    console.log(`  estado → ${u.estado_objetivo}${u.modulo ? `, módulo → "${u.modulo}"` : ""}`)
    console.log(`  comentario (${u.comentario.length} chars):`)
    console.log(
      u.comentario
        .split("\n")
        .map((l) => `    │ ${l}`)
        .join("\n"),
    )

    if (!APPLY) {
      console.log("  · (dry-run) skip\n")
      continue
    }

    const updatePayload: Record<string, string> = { estado: u.estado_objetivo }
    if (u.modulo) updatePayload.modulo = u.modulo

    const { error: updErr } = await supabase
      .from("sugerencias")
      .update(updatePayload)
      .eq("id", u.id)
    if (updErr) { console.log("  ✗ Error update:", updErr.message); continue }
    console.log(`  ✓ Sugerencia actualizada`)

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

  if (!APPLY) {
    console.log("\n⚠️  DRY-RUN: ningún cambio fue persistido. Re-ejecutá con --apply para escribir.")
  }
}

main().catch(console.error)

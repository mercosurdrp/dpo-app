// Sube un archivo local como NUEVA VERSIÓN de un archivo ya cargado en el módulo
// de evidencia DPO (tabla dpo_archivos + dpo_archivo_versiones, bucket dpo-evidencia).
// Replica lo que hace `guardarNuevaVersionDesdeBuffer` en src/actions/dpo-evidencia.ts
// pero desde la terminal, para los SOP que se generan por script (ej. el 4.2).
//
//   node scripts/subir-version-dpo-archivo.mjs <archivo_id> <ruta local> <notas> [uploaded_by]
//
// Usa el .env.local del proyecto (service role). La carpeta de Storage se toma de
// la versión anterior, así todas las versiones quedan juntas.
import fs from "node:fs"
import { basename, extname } from "node:path"
import { createClient } from "@supabase/supabase-js"

const [archivoId, rutaLocal, notas, uploadedByArg] = process.argv.slice(2)
if (!archivoId || !rutaLocal || !notas) {
  console.error("Uso: node scripts/subir-version-dpo-archivo.mjs <archivo_id> <ruta local> <notas> [uploaded_by]")
  process.exit(1)
}

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const MIME = { pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
// Mismo criterio que `claveSegura` de la app: sin acentos ni caracteres raros.
const claveSegura = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")

const { data: cur, error: e0 } = await sb.from("dpo_archivos").select("id,titulo,pilar_codigo,punto_codigo,current_version,current_file_path,uploaded_by").eq("id", archivoId).single()
if (e0) throw e0
const nextVersion = cur.current_version + 1
const carpeta = cur.current_file_path.split("/").slice(0, -1).join("/")
const file_name = basename(rutaLocal)
const file_ext = extname(file_name).slice(1).toLowerCase()
const mime_type = MIME[file_ext] ?? "application/octet-stream"
const buf = fs.readFileSync(rutaLocal)
const path = `${carpeta}/v${nextVersion}-${claveSegura(file_name)}`
const uploaded_by = uploadedByArg ?? cur.uploaded_by

console.log(`"${cur.titulo}" (${cur.pilar_codigo} ${cur.punto_codigo}): v${cur.current_version} → v${nextVersion}`)
const { error: e1 } = await sb.storage.from("dpo-evidencia").upload(path, buf, { contentType: mime_type, upsert: false })
if (e1) throw e1
const { error: e2 } = await sb.from("dpo_archivo_versiones").insert({ archivo_id: archivoId, version: nextVersion, file_path: path, file_name, file_size: buf.length, notas, uploaded_by })
if (e2) { await sb.storage.from("dpo-evidencia").remove([path]); throw e2 }
const { error: e3 } = await sb.from("dpo_archivos").update({ current_version: nextVersion, current_file_path: path, current_file_size: buf.length, file_name, file_ext, mime_type, updated_at: new Date().toISOString() }).eq("id", archivoId)
if (e3) throw e3
console.log("Subido:", path, `(${buf.length} bytes)`)

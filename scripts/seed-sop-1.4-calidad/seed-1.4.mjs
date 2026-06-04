// Seed del punto DPO 1.4 (Entrega) — "Calidad de entrega de los productos".
// Replica el patrón del SOP 1.3 (post-ruta), pero el PPT YA EXISTE (no se genera):
//   1) SOP .docx        -> bucket privado `dpo-evidencia` + dpo_archivos + dpo_archivo_versiones
//   2) Capacitación      -> capacitaciones + capacitacion_dpo_puntos + capacitacion_preguntas
//   3) PPT material      -> bucket público `evidencias` (capacitaciones/{capId}/material.pptx) + material_url
//   4) OWD               -> owd_templates + owd_items (items por etapa del SOP)
//
// Idempotente: aborta si ya existe template/capacitación/SOP para el punto 1.4.
// Registra todos los IDs en rollback-1.4.json para revertir.
//
// Uso:  cd /root/dpo-app && node scripts/seed-sop-1.4-calidad/seed-1.4.mjs

import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { randomUUID } from "crypto"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = "/root/dpo-app"
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const PREGUNTA_14 = "8d76cc3d-1d4e-4274-ac46-281cf22bdfd2" // punto DPO 1.4 "Calidad de entrega"
const PILAR_CODIGO = "entrega"
const PUNTO_CODIGO = "1.4"
const UPLOADED_BY = "e579be0a-64ef-4572-8a55-c0fbfe03e57f" // Fausto Azzaretti (admin)
const SOP_PATH = join(ROOT, "sops/04-entrega/calidad/4.1 - SOP - Calidad en el Proceso de Ejecución de Entrega en Ruta (Reparado).docx")
const PPTX_PATH = join(ROOT, "sops/04-entrega/calidad/Copia de Calidad.pptx")
const SOP_FILENAME = "4.1 - SOP - Calidad en la entrega en ruta.docx"
const SOP_TITULO = "4.1 - SOP - Calidad en la entrega en ruta"
const rollback = { creado: "2026-06-04", pregunta_id: PREGUNTA_14 }

function die(msg) { console.error("✗", msg); process.exit(1) }

function sanitizeFilename(name) {
  const dotIdx = name.lastIndexOf(".")
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : ""
  const safeBase = base.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "")
  const safeExt = ext.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.]+/g, "")
  return (safeBase || "archivo") + safeExt.toLowerCase()
}

// --- Guardas anti-duplicado ---
const { data: tplExist } = await sb.from("owd_templates").select("id").eq("pregunta_id", PREGUNTA_14)
if (tplExist?.length) die(`Ya existe owd_template para 1.4 (${tplExist[0].id}). Abortando.`)
const { data: capExist } = await sb.from("capacitaciones").select("id").ilike("titulo", "SOP 1.4 —%")
if (capExist?.length) die(`Ya existe capacitación "SOP 1.4 —…" (${capExist[0].id}). Abortando.`)
const { data: sopExist } = await sb.from("dpo_archivos").select("id").eq("pilar_codigo", PILAR_CODIGO).eq("punto_codigo", PUNTO_CODIGO).eq("categoria", "SOP")
if (sopExist?.length) die(`Ya existe un SOP cargado en entrega/1.4 (${sopExist[0].id}). Abortando.`)
if (!existsSync(SOP_PATH)) die(`No encuentro el SOP: ${SOP_PATH}`)
if (!existsSync(PPTX_PATH)) die(`No encuentro el PPT: ${PPTX_PATH}`)

// ============================ 1) SOP (evidencia) ============================
const archivoId = randomUUID()
const sopStoragePath = `${PILAR_CODIGO}/${PUNTO_CODIGO}/${randomUUID()}/v1-${sanitizeFilename(SOP_FILENAME)}`
const sopBuf = readFileSync(SOP_PATH)
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
{
  const { error: eUp } = await sb.storage.from("dpo-evidencia").upload(sopStoragePath, sopBuf, { contentType: DOCX_MIME, upsert: true })
  if (eUp) die("upload SOP: " + eUp.message)
  const { error: eA } = await sb.from("dpo_archivos").insert({
    id: archivoId, pilar_codigo: PILAR_CODIGO, punto_codigo: PUNTO_CODIGO,
    requisito_codigo: "R1.4.2", titulo: SOP_TITULO,
    descripcion: "SOP de Calidad en la ejecución de la entrega en ruta. Cubre la preservación de la calidad del producto antes de salir (picking, film, verificación de carga), la estiba y acomodo de pallets, la calidad de los productos, el cuidado durante el trayecto y la descarga en el PDV, la manipulación de SKUs de Marketplace (5.2.1) y el control del verificador al retornar al CD. Indicador asociado: DQI.",
    categoria: "SOP", file_name: SOP_FILENAME, file_ext: "docx", mime_type: DOCX_MIME,
    current_version: 1, current_file_path: sopStoragePath, current_file_size: sopBuf.length,
    uploaded_by: UPLOADED_BY, archivado: false,
  }).select("id").single()
  if (eA) { await sb.storage.from("dpo-evidencia").remove([sopStoragePath]); die("insert dpo_archivos: " + eA.message) }
  const { error: eV } = await sb.from("dpo_archivo_versiones").insert({
    archivo_id: archivoId, version: 1, file_path: sopStoragePath, file_name: SOP_FILENAME,
    file_size: sopBuf.length, notas: null, uploaded_by: UPLOADED_BY,
  })
  if (eV) die("insert dpo_archivo_versiones: " + eV.message)
  rollback.dpo_archivo_id = archivoId
  rollback.sop_storage_path = sopStoragePath
  console.log("✓ SOP subido", archivoId)
}

// ============================ 2) Capacitación ============================
const { data: cap, error: eC } = await sb.from("capacitaciones").insert({
  titulo: "SOP 1.4 — Calidad de entrega de los productos",
  descripcion: "Capacitación para los equipos de entrega (choferes y ayudantes) sobre cómo preservar la calidad del producto en toda la cadena de entrega: antes de salir a la ruta (manipulación en picking, film stretch, verificación de la carga), estiba máxima por SKU y acomodo de pallets, calidad de los productos (sin roturas, corrosión ni envases dañados), cuidados durante el trayecto (lonas siempre cerradas, manejo prudente) y en la descarga en el PDV (no arrojar la mercadería, agarre por los laterales, no superar 4 cajones de altura en el carro), manipulación de SKUs de Marketplace y qué hacer ante un producto roto o dañado (rechazo al cliente y segregación). El material en PowerPoint acompaña la matinal. Indicador asociado: DQI.",
  instructor: "Fausto Azzaretti",
  fecha: "2026-06-04",
  duracion_horas: 1,
  estado: "programada",
  pilar: "Entrega",
  visible: true,
}).select("id").single()
if (eC) die("insert capacitaciones: " + eC.message)
const capId = cap.id
rollback.capacitacion_id = capId
console.log("✓ capacitacion", capId)

const { error: eL } = await sb.from("capacitacion_dpo_puntos").insert({ capacitacion_id: capId, pregunta_id: PREGUNTA_14 })
if (eL) die("insert capacitacion_dpo_puntos: " + eL.message)
console.log("✓ vínculo capacitacion → punto DPO 1.4")

const PREGS = [
  // [texto, opciones, idx_correcto]
  ["¿En qué condiciones debe salir el producto del depósito para garantizar la calidad?", ["En su empaque original, sin humedad y libre de polvo", "Con cualquier empaque mientras esté lleno", "Apilado al máximo sin importar el film", "Solo importa que llegue a tiempo al PDV"], 0],
  ["Una vez armado el pallet en picking, ¿qué se debe hacer para evitar desplazamientos y roturas?", ["Dejarlo suelto para acomodarlo en el camión", "Colocar correctamente el film stretch", "Apilar otro pallet encima", "Mojarlo para que asiente la carga"], 1],
  ["¿Cuál es la estiba máxima para la lata de 473 cc?", ["12 pisos", "10 pisos", "7 pisos", "5 pisos"], 1],
  ["¿Cuántos pisos como máximo se estiba la botella de 1500 cc?", ["7 pisos", "6 pisos", "5 pisos", "4 pisos"], 2],
  ["Durante el trayecto hasta el PDV, las lonas del camión deben transitar…", ["Abiertas para ventilar la carga", "SIEMPRE cerradas", "Abiertas solo en ruta de tierra", "Indistinto según el clima"], 1],
  ["Al bajar los productos del camión hacia el ayudante que está en piso, se deben…", ["Arrojar para agilizar la descarga", "Nunca arrojar; bajarlos con cuidado", "Tirar solo los packs livianos", "Dejar caer sobre el carro"], 1],
  ["¿Cómo se deben agarrar los packs al trasladarlos para no dañar el empaque?", ["De la parte media", "De los laterales, nunca del medio", "Rompiendo el termocontraíble", "De cualquier forma si es rápido"], 1],
  ["Al apilar productos en el carro, ¿qué altura máxima no se debe superar?", ["Dos cajones 1/1", "La altura de cuatro cajones 1/1", "Seis cajones 1/1", "No hay límite"], 1],
  ["Si se detecta un producto roto, dañado, sucio o con humedad en el PDV, el fletero debe…", ["Entregarlo igual con descuento", "Comunicar al cliente y rechazar el pack, entregándolo en la próxima visita", "Dejarlo en el cliente para que decida", "Descartarlo en el PDV"], 1],
  ["El producto roto o dañado, ¿qué destino tiene dentro del camión?", ["Se deja en el cliente", "Se levanta y se segrega en la parte posterior, sobre pallet y ordenado", "Se mezcla con el producto apto", "Se tira por la ventanilla"], 1],
  ["¿Cómo se deben manipular los SKUs de Marketplace (MKTP)?", ["Igual que cualquier SKU, sin distinción", "Con cuidado, sin lanzarlos, sin mezclarlos con SKUs no-MKP y acomodados de mayor a menor peso", "Apilando lo más pesado arriba", "Pueden pisarse si están bien cerrados"], 1],
  ["Al retornar al CD con producto dañado, ¿quién controla y clasifica la mercadería que vuelve?", ["El cajero", "El verificador de reparto", "El gerente comercial", "Nadie, vuelve directo a picking"], 1],
].map(([texto, opciones, respuesta_correcta], i) => ({
  capacitacion_id: capId, texto, opciones: JSON.stringify(opciones), respuesta_correcta, orden: i,
}))

const { error: eP } = await sb.from("capacitacion_preguntas").insert(PREGS)
if (eP) die("insert capacitacion_preguntas: " + eP.message)
console.log("✓ capacitacion_preguntas", PREGS.length)

// ============================ 3) PPT material ============================
{
  const storagePath = `capacitaciones/${capId}/material.pptx`
  const buf = readFileSync(PPTX_PATH)
  const { error: eU } = await sb.storage.from("evidencias").upload(storagePath, buf, {
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    upsert: true,
  })
  if (eU) die("upload pptx: " + eU.message)
  const { data: pub } = sb.storage.from("evidencias").getPublicUrl(storagePath)
  const { error: eUp } = await sb.from("capacitaciones").update({ material_url: pub.publicUrl }).eq("id", capId)
  if (eUp) die("update material_url: " + eUp.message)
  rollback.material_path = storagePath
  rollback.material_url = pub.publicUrl
  console.log("✓ material.pptx subido +", pub.publicUrl)
}

// ============================ 4) OWD ============================
const { data: tpl, error: eT } = await sb.from("owd_templates").insert({
  pregunta_id: PREGUNTA_14,
  nombre: "OWD Calidad de entrega",
  descripcion: "Observación en el puesto de trabajo del proceso de calidad en la ejecución de la entrega en ruta (SOP 1.4). El supervisor verifica, punto por punto, la preservación de la calidad del producto desde la verificación de la carga hasta el retorno del camión al CD.",
  meta_mensual: 8,
  meta_cumplimiento_pct: 90,
  activo: true,
}).select("id").single()
if (eT) die("insert owd_templates: " + eT.message)
const templateId = tpl.id
rollback.owd_template_id = templateId
console.log("✓ owd_template", templateId)

const ITEMS = [
  // [etapa, texto, descripcion, critico]
  ["Antes de salir a la ruta", "El operario de picking manipula el producto asegurando su integridad y separa el no conforme avisando al supervisor", "El producto con problemas se almacena en sector identificado, sin mezclar con el conforme", true],
  ["Antes de salir a la ruta", "El pallet armado tiene el film stretch colocado correctamente", "Evita desplazamientos y roturas en el transporte", true],
  ["Antes de salir a la ruta", "El receptáculo del vehículo está limpio, sin humedad, roturas ni suciedad", "Limpieza con detergente y luego desinfectante apto para uso alimentario", false],
  ["Antes de salir a la ruta", "El chofer realiza la verificación de la carga y, ante un bulto con problema de calidad, llama al SDR", "", true],

  ["Pallets y acomodo de la carga", "La carga es pareja en alto y ancho; los pallets están conformados, alineados y sin inclinaciones", "", false],
  ["Pallets y acomodo de la carga", "Se respeta la cantidad máxima de estiba según el producto", "Lata 269/354=12, lata 473=10, bot 500=7, 750=6, 1500=5, 2250=4, Gatorade 1250=4, no retornables y cajones=5 pisos", true],
  ["Pallets y acomodo de la carga", "No hay objetos puntiagudos ni partes sueltas en los pallets", "", false],
  ["Pallets y acomodo de la carga", "Los productos están acomodados según la política de apilabilidad", "", false],

  ["Calidad en los productos", "Los pallets están libres de pérdidas y pinchaduras de producto", "", true],
  ["Calidad en los productos", "No hay puntos de corrosión, particularmente en las latas", "", false],
  ["Calidad en los productos", "Los productos no presentan roturas, abolladuras ni tapas dañadas", "", true],
  ["Calidad en los productos", "Los envases están limpios y las etiquetas en perfectas condiciones", "Sin partes arrugadas, desalineadas ni despegadas", false],

  ["Durante la entrega", "Se mantiene la limpieza y la caja y cabina están libres de elementos personales y externos", "Solo se permite tener mudas de remera y desodorante", false],
  ["Durante la entrega", "Hay un sitio determinado para segregar rechazos/roturas y las lonas están en óptimas condiciones", "", false],
  ["Durante la entrega", "El chofer transita SIEMPRE con las lonas cerradas", "", true],
  ["Durante la entrega", "Respeta velocidades máximas, evita movimientos bruscos y acomoda la carga durante el reparto", "Distribuye packs en paletas vacías", false],

  ["Descarga en el PDV", "No se arrojan productos hacia el ayudante que recibe en piso", "", true],
  ["Descarga en el PDV", "Apila en el carro los cajones en la base y los packs de calibre mayor a menor, sin superar 4 cajones 1/1", "", false],
  ["Descarga en el PDV", "Traslada los packs agarrándolos de los laterales y sin romper el termocontraíble", "", true],
  ["Descarga en el PDV", "Traslada los productos del camión a la puerta del PDV con sumo cuidado", "", false],

  ["Marketplace (MKTP)", "Los SKUs de Marketplace se manipulan con cuidado, sin lanzarlos y sin mezclarlos con SKUs no-MKP", "", true],
  ["Marketplace (MKTP)", "Se acomodan según el gramaje (de mayor a menor peso) y no se apoyan objetos pesados sobre las cajas", "No caminar, sentarse ni apoyar los pies sobre las cajas", false],

  ["Retorno del camión", "Ante un producto roto o dañado, el chofer lo comunica al cliente, rechaza el pack y lo segrega en la parte posterior sobre pallet", "El producto dañado nunca se deja en el cliente", true],
  ["Retorno del camión", "El verificador controla la mercadería que retorna y la clasifica según su estado (apta / reempaque / derrame)", "Aviso del chofer aunque no haya novedad", true],
  ["Retorno del camión", "Los films se segregan, los chapadures se ordenan y los cajones rotos y tapas se segregan", "", false],
].map(([etapa, texto, descripcion, critico], i) => ({
  template_id: templateId, version: 1, etapa, orden: i + 1, texto,
  descripcion: descripcion || null, critico, active: true,
}))

const { data: itemsIns, error: eI } = await sb.from("owd_items").insert(ITEMS).select("id")
if (eI) die("insert owd_items: " + eI.message)
rollback.owd_item_ids = itemsIns.map(r => r.id)
console.log("✓ owd_items", itemsIns.length)

writeFileSync(join(__dirname, "rollback-1.4.json"), JSON.stringify(rollback, null, 2))
console.log("\n✅ LISTO. IDs guardados en rollback-1.4.json")
console.log(JSON.stringify(rollback, null, 2))

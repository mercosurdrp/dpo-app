// Seed del punto DPO 1.3 (Entrega) — Procesos post-ruta y cierre físico.
// Replica el patrón del SOP 1.2 "En Ruta" (creado 2026-05-28):
//   1) owd_templates + owd_items   (OWD del punto)
//   2) capacitaciones + capacitacion_dpo_puntos + capacitacion_preguntas
//   3) sube material.pptx al bucket público `evidencias` y setea material_url
//
// Idempotente: si ya existe el template/capacitación para la pregunta 1.3, aborta.
// Registra todos los IDs insertados en rollback-1.3.json para poder revertir.
//
// Uso:  cd /root/dpo-app && node scripts/seed-sop-1.3-postruta/seed-1.3.mjs

import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join("/root/dpo-app", ".env.local"), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const PREGUNTA_13 = "6e378300-daad-4fb6-ac0f-171a18b28777" // punto DPO 1.3
const PPTX_PATH = "/tmp/material-1.3.pptx"
const rollback = { creado: new Date().toISOString(), pregunta_id: PREGUNTA_13 }

function die(msg) { console.error("✗", msg); process.exit(1) }

// --- Guardas anti-duplicado ---
const { data: tplExist } = await sb.from("owd_templates").select("id").eq("pregunta_id", PREGUNTA_13)
if (tplExist?.length) die(`Ya existe owd_template para la pregunta 1.3 (${tplExist[0].id}). Abortando para no duplicar.`)
const { data: capExist } = await sb.from("capacitaciones").select("id").ilike("titulo", "SOP 1.3 —%")
if (capExist?.length) die(`Ya existe capacitación "SOP 1.3 —…" (${capExist[0].id}). Abortando para no duplicar.`)
if (!existsSync(PPTX_PATH)) die(`No encuentro ${PPTX_PATH}. Corré primero gen_pptx_1.3.py`)

// ============================ 1) OWD ============================
const { data: tpl, error: eT } = await sb.from("owd_templates").insert({
  pregunta_id: PREGUNTA_13,
  nombre: "OWD Post-Ruta",
  descripcion: "Observación en el puesto de trabajo del proceso de post-ruta y cierre físico (SOP 1.3). El supervisor de rutas verifica el cierre financiero del chofer y la verificación física del ayudante al retornar al CD, punto por punto.",
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
  ["Cierre financiero", "Solicita la llave de la caja fuerte al controlador y la devuelve tras recolectar el dinero", "Caja de llaves Nave 2", false],
  ["Cierre financiero", "Realiza el recuento del dinero con el contador de billetes y lo rinde a tesorería", "Tesorería corrobora el importe informado", true],
  ["Cierre financiero", "Controla las notas de crédito, cheques y transferencias recibidas", "", true],
  ["Cierre financiero", "Completa la planilla de caja con todos los montos para conciliar", "Efectivo, cheques, transferencias, CC, rechazos, cobranzas, venta de envases", true],
  ["Cierre financiero", "Entrega la planilla y la documentación a tesorería y administración", "Para la liquidación del reparto", false],

  ["Verificación física", "Permite la toma del odómetro y registra el equipo que retorna al ingresar al CD", "", false],
  ["Verificación física", "Estaciona en el sector de descarga, coloca los tacos de seguridad y abre las cortinas", "", true],
  ["Verificación física", "Permanece en la zona segura mientras el autoelevador retira vacíos y devoluciones", "Supervisa el procedimiento permanentemente", true],
  ["Verificación física", "Realiza la limpieza y sanitizado de la carrocería e interior de la unidad", "Obligatorio todos los días", true],
  ["Verificación física", "Deposita la llave en el buzón y marca el biométrico antes de salir del CD", "", false],

  ["Control de envases y devoluciones", "El controlador registra en Chess los productos que retornan (rechazos y envases)", "Check-in", true],
  ["Control de envases y devoluciones", "Clasifica envases y cajones verificando su integridad", "", false],
  ["Control de envases y devoluciones", "Separa los envases y cajones de la competencia en el sector exclusivo", "", false],
  ["Control de envases y devoluciones", "Clasifica las devoluciones en buen y mal estado según vencimiento y daños", "Mal estado → reempaque o descarte", true],

  ["Revisión de la unidad", "Completa el checklist de retorno de la unidad en CloudFleet", "", true],
  ["Revisión de la unidad", "Da aviso de los desperfectos detectados para coordinar con el servicio técnico", "", false],
  ["Revisión de la unidad", "Notifica la carga de combustible y la calibración de neumáticos si corresponde", "Calibración mensual", false],
].map(([etapa, texto, descripcion, critico], i) => ({
  template_id: templateId, version: 1, etapa, orden: i + 1, texto,
  descripcion: descripcion || null, critico, active: true,
}))

const { data: itemsIns, error: eI } = await sb.from("owd_items").insert(ITEMS).select("id")
if (eI) die("insert owd_items: " + eI.message)
rollback.owd_item_ids = itemsIns.map(r => r.id)
console.log("✓ owd_items", itemsIns.length)

// ============================ 2) Capacitación ============================
const { data: cap, error: eC } = await sb.from("capacitaciones").insert({
  titulo: "SOP 1.3 — Procesos post-ruta y cierre físico",
  descripcion: "Capacitación operativa para choferes y ayudantes sobre los procesos de post-ruta y el cierre físico del reparto (SOP 1.3 del pilar Entrega). Incluye el cierre financiero del chofer (rendición y planilla de caja), la verificación física del ayudante (descarga segura, limpieza y sanitizado), el control de envases y devoluciones (rechazos y clasificación), la revisión de la unidad en CloudFleet y los tiempos internos objetivo (≤ 40 min cada uno). Duración 1 h. El material en PowerPoint (15 slides) está pensado para acompañar la matinal.",
  instructor: "Fausto Azzaretti",
  fecha: "2026-05-29",
  duracion_horas: 1,
  estado: "programada",
  pilar: "Entrega",
  visible: true,
}).select("id").single()
if (eC) die("insert capacitaciones: " + eC.message)
const capId = cap.id
rollback.capacitacion_id = capId
console.log("✓ capacitacion", capId)

const { error: eL } = await sb.from("capacitacion_dpo_puntos").insert({ capacitacion_id: capId, pregunta_id: PREGUNTA_13 })
if (eL) die("insert capacitacion_dpo_puntos: " + eL.message)
console.log("✓ vínculo capacitacion → punto DPO 1.3")

const PREGS = [
  ["¿Cuál es el tiempo máximo definido para la verificación física?", ["20 minutos", "30 minutos", "40 minutos", "60 minutos"], 2],
  ["¿Quién es el responsable de realizar el cierre financiero?", ["El ayudante", "El chofer", "El autoelevadorista", "El recepcionista"], 1],
  ["¿Quién realiza la verificación física al retornar al CD?", ["El chofer", "El SDR", "El ayudante", "El cajero"], 2],
  ["Al ingresar al CD con la unidad, ¿qué se registra primero?", ["El nivel de combustible", "La medición del odómetro y el equipo que retorna", "La cantidad de rechazos", "El horario de salida del PDV"], 1],
  ["¿Dónde se ubican los envases y cajones de la competencia?", ["Junto a nuestra marca", "En un sector exclusivo, separado de nuestra marca", "Se desechan directamente", "En el camión hasta el día siguiente"], 1],
  ["Una devolución en buen estado vuelve al stock cuando…", ["Siempre, sin excepción", "No está próxima a vencer y no tiene daños en envase ni empaque", "El cliente lo solicita", "Tiene el empaque roto"], 1],
  ["Un producto con el empaque roto pero apto, ¿a dónde se destina?", ["Se desecha", "Al área de reempaque para reemplazar el packaging", "Vuelve directo al stock", "Se entrega como bonificación"], 1],
  ["¿Dónde registra el chofer un problema del camión al retornar de la ruta?", ["En un cuaderno", "En la aplicación CloudFleet (Checklist de retorno)", "Por teléfono al gerente", "En la planilla de caja"], 1],
  ["La revisión mensual de la unidad, ¿quién la completa y cada cuánto?", ["El chofer, cada semana", "El SDR, una vez al mes", "El ayudante, cada día", "Administración, cada trimestre"], 1],
  ["¿Qué documento completa el chofer con los montos para conciliar el cierre?", ["El remito", "La planilla de caja", "La nota de crédito", "El checklist de retorno"], 1],
  ["¿Con qué frecuencia es obligatoria la limpieza y sanitizado de la unidad?", ["Una vez por semana", "Todos los días", "Una vez al mes", "Solo cuando está sucia"], 1],
  ["Además del efectivo, ¿qué debe controlar el chofer en el cierre financiero?", ["Solo el efectivo", "Notas de crédito, cheques y transferencias", "El nivel de combustible", "La cantidad de envases vacíos"], 1],
].map(([texto, opciones, respuesta_correcta], i) => ({
  capacitacion_id: capId, texto, opciones: JSON.stringify(opciones), respuesta_correcta, orden: i,
}))

const { error: eP } = await sb.from("capacitacion_preguntas").insert(PREGS)
if (eP) die("insert capacitacion_preguntas: " + eP.message)
console.log("✓ capacitacion_preguntas", PREGS.length)

// ============================ 3) PPT ============================
const storagePath = `capacitaciones/${capId}/material.pptx`
const buf = readFileSync(PPTX_PATH)
const { error: eU } = await sb.storage.from("evidencias").upload(storagePath, buf, {
  contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  upsert: true,
})
if (eU) die("upload pptx: " + eU.message)
const { data: pub } = sb.storage.from("evidencias").getPublicUrl(storagePath)
const materialUrl = pub.publicUrl
const { error: eUp } = await sb.from("capacitaciones").update({ material_url: materialUrl }).eq("id", capId)
if (eUp) die("update material_url: " + eUp.message)
rollback.material_path = storagePath
rollback.material_url = materialUrl
console.log("✓ material.pptx subido +", materialUrl)

writeFileSync(join(__dirname, "rollback-1.3.json"), JSON.stringify(rollback, null, 2))
console.log("\n✅ LISTO. IDs guardados en rollback-1.3.json")
console.log(JSON.stringify(rollback, null, 2))

/**
 * Camión bloqueado por un ítem CRÍTICO en NO OK del checklist.
 *
 * Regla (Fausto, 03/11/2026): cuando un chofer carga un checklist —de salida o
 * de retorno— con un ítem crítico en NO OK / malo,
 *  1. se manda un WhatsApp al número de trabajo de Fausto con el detalle, y
 *  2. la unidad queda NO DISPONIBLE: portería no puede darle egreso.
 *
 * El bloqueo NO se guarda en ningún lado: se deriva de los datos. Un camión
 * está bloqueado mientras tenga un ítem crítico en NO OK cuyo plan de acción
 * (`checklist_planes_accion`) no esté «resuelto». Cuando mantenimiento cierra
 * el plan, el camión se libera solo; y si fue una falsa alarma, un
 * admin/supervisor lo libera con motivo (eso también cierra el plan, así queda
 * escrito por qué salió sin reparar).
 *
 * Además se registra la parada en `flota_indisponibilidad` (IND) para que la
 * disponibilidad de flota cuente los días que estuvo afuera, igual que el cron
 * de documentación vencida.
 *
 * Solo Pampeana: en Misiones no hay número de alerta ni instancia de WhatsApp.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import { IS_MISIONES } from "@/lib/empresa"
import {
  fechaHoraAR,
  type CamionBloqueado,
  type ItemCriticoAbierto,
} from "./bloqueo-critico-tipos"

export { fechaHoraAR, type CamionBloqueado, type ItemCriticoAbierto }

/**
 * A quién le llega el aviso. Números separados por coma; se puede pisar por
 * env `ALERTA_CHECKLIST_CRITICO_TEL` con el mismo formato.
 *  - 5493364627812: número de trabajo de Fausto (03/11/2026)
 *  - 5493364521741: Ezequiel Teves, encargado de mantenimiento / supervisor de flota
 */
export const ALERTA_CRITICO_TELS = (
  process.env.ALERTA_CHECKLIST_CRITICO_TEL || "5493364627812,5493364521741"
)
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter((s) => s.length >= 10)

/**
 * Desde cuándo cuenta la regla. Hay rechazos viejos (abril-agosto) cuyos
 * planes nunca se cerraron en la app: sin este corte, el deploy dejaría
 * bloqueados camiones que salen todos los días.
 */
export const BLOQUEO_CRITICO_DESDE = "2026-11-03"

export const MOTIVO_IND_CRITICO = "Checklist con crítico NO OK"

const APP_URL = "https://dpo-app-self.vercel.app"
const VALORES_MALOS = ["nook", "malo"]

type Admin = ReturnType<typeof createAdminClient>

/** Fecha de hoy en Argentina (YYYY-MM-DD). */
export function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date())
}

type RespRow = {
  id: string
  checklist_id: string
  valor: string
  comentario: string | null
  item: { nombre: string; critico: boolean } | null
  cv: {
    id: string
    fecha: string
    hora: string
    dominio: string
    tipo: string
    chofer: string | null
  } | null
}

/**
 * Camiones bloqueados hoy, por dominio. Con `dominio` mira solo esa unidad.
 * Lee con el cliente admin: lo llaman la portería, el chofer y los crons.
 */
export async function getBloqueosCriticos(
  dominio?: string,
  supabase: Admin = createAdminClient(),
): Promise<Map<string, CamionBloqueado>> {
  const out = new Map<string, CamionBloqueado>()
  if (IS_MISIONES) return out

  let q = supabase
    .from("checklist_respuestas")
    .select(
      "id, checklist_id, valor, comentario, item:checklist_items!inner(nombre, critico), cv:checklist_vehiculos!inner(id, fecha, hora, dominio, tipo, chofer)",
    )
    .eq("item.critico", true)
    .in("valor", VALORES_MALOS)
    .gte("cv.fecha", BLOQUEO_CRITICO_DESDE)
  if (dominio) q = q.eq("cv.dominio", dominio.trim().toUpperCase())
  const { data, error } = await q
  if (error) throw new Error(`Leyendo críticos del checklist: ${error.message}`)

  const filas = ((data || []) as unknown as RespRow[]).filter((r) => r.item && r.cv)
  if (filas.length === 0) return out

  const { data: planes, error: errPlanes } = await supabase
    .from("checklist_planes_accion")
    .select("respuesta_id, estado")
    .in(
      "respuesta_id",
      filas.map((f) => f.id),
    )
  if (errPlanes) throw new Error(`Leyendo planes de acción: ${errPlanes.message}`)
  const estadoPlan = new Map(
    ((planes || []) as Array<{ respuesta_id: string; estado: string }>).map((p) => [
      p.respuesta_id,
      p.estado,
    ]),
  )

  for (const f of filas) {
    const estado = estadoPlan.get(f.id)
    if (estado === "resuelto") continue
    const dom = f.cv!.dominio.trim().toUpperCase()
    const actual = out.get(dom) ?? { dominio: dom, desde: f.cv!.hora, items: [] }
    actual.items.push({
      respuestaId: f.id,
      checklistId: f.checklist_id,
      item: f.item!.nombre,
      comentario: f.comentario?.trim() || null,
      fecha: f.cv!.fecha,
      hora: f.cv!.hora,
      tipo: f.cv!.tipo,
      chofer: f.cv!.chofer,
      planEstado: estado === "pendiente" || estado === "en_proceso" ? estado : "sin_plan",
    })
    if (f.cv!.hora < actual.desde) actual.desde = f.cv!.hora
    out.set(dom, actual)
  }
  for (const b of out.values()) b.items.sort((a, b2) => a.hora.localeCompare(b2.hora))
  return out
}

/**
 * ¿El bloqueo alcanza a un egreso de portería en `fecha` a las `hora` (HH:MM,
 * hora argentina)? Un crítico de la salida del mismo día bloquea siempre (el
 * checklist de salida es previo a salir); uno de un retorno solo bloquea los
 * egresos posteriores. Así portería puede cargar tarde el egreso de la mañana
 * de un camión que a la tarde volvió con un crítico.
 */
export function bloqueaEgreso(b: CamionBloqueado, fecha: string, hora: string): ItemCriticoAbierto[] {
  const egresoMs = new Date(`${fecha}T${hora.slice(0, 5)}:00-03:00`).getTime()
  return b.items.filter((i) => {
    if (i.fecha < fecha) return true
    if (i.fecha > fecha) return false
    if (i.tipo === "liberacion") return true
    return new Date(i.hora).getTime() < egresoMs
  })
}

/** Mensaje de portería cuando no puede dar el egreso. */
export function mensajeBloqueo(dominio: string, items: ItemCriticoAbierto[]): string {
  const lista = [...new Set(items.map((i) => i.item))].join(", ")
  return `${dominio} está BLOQUEADO para salir: checklist con ítem crítico NO OK (${lista}) del ${fechaHoraAR(items[0].hora)}. Puede salir cuando mantenimiento resuelva el plan de acción o un supervisor lo libere.`
}

/** Manda a todos los destinos; que falle uno no frena a los demás. */
async function enviar(texto: string): Promise<void> {
  const fallas: string[] = []
  for (const tel of ALERTA_CRITICO_TELS) {
    try {
      const r = await Promise.race([
        sendText(tel, texto),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout 10 s")), 10_000)),
      ])
      if (!r.ok) fallas.push(`${tel}: Evolution respondió ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`)
    } catch (e) {
      fallas.push(`${tel}: ${e instanceof Error ? e.message : e}`)
    }
  }
  if (fallas.length > 0) throw new Error(fallas.join(" | "))
}

/**
 * WhatsApp a Fausto con el checklist recién cargado. Nunca tira: un WhatsApp
 * caído no puede hacer fallar la carga del checklist del chofer.
 */
export async function avisarChecklistCritico(checklistId: string): Promise<void> {
  if (IS_MISIONES) return
  try {
    const supabase = createAdminClient()
    const { data: cv, error } = await supabase
      .from("checklist_vehiculos")
      .select("id, fecha, hora, dominio, tipo, chofer, observaciones")
      .eq("id", checklistId)
      .maybeSingle()
    if (error || !cv) throw new Error(error?.message ?? "checklist no encontrado")

    const { data: resp } = await supabase
      .from("checklist_respuestas")
      .select("valor, comentario, item:checklist_items(nombre, critico)")
      .eq("checklist_id", checklistId)
      .in("valor", VALORES_MALOS)
    const malas = ((resp || []) as unknown as Array<{
      comentario: string | null
      item: { nombre: string; critico: boolean } | null
    }>).filter((r) => r.item)
    const criticas = malas.filter((r) => r.item!.critico)
    if (criticas.length === 0) return
    const otras = malas.filter((r) => !r.item!.critico)

    const linea = (r: { comentario: string | null; item: { nombre: string } | null }) =>
      `• ${r.item!.nombre}${r.comentario?.trim() ? ` — "${r.comentario.trim()}"` : ""}`

    const partes = [
      `🚨 *Checklist con problema CRÍTICO*`,
      ``,
      `🚛 *${cv.dominio}* — checklist de ${cv.tipo === "liberacion" ? "salida" : "retorno"}`,
      `👤 ${cv.chofer || "Sin chofer"}`,
      `🕐 ${fechaHoraAR(cv.hora)}`,
      ``,
      `❌ *Críticos NO OK:*`,
      ...criticas.map(linea),
    ]
    if (otras.length > 0) partes.push(``, `⚠️ Otros ítems NO OK:`, ...otras.map(linea))
    if (cv.observaciones?.trim()) partes.push(``, `📝 ${cv.observaciones.trim()}`)
    partes.push(
      ``,
      `⛔ El camión queda *NO DISPONIBLE*: portería no puede darle egreso hasta que se resuelva el plan de acción.`,
      `🔗 ${APP_URL}/vehiculos/checklist/${cv.id}`,
    )
    await enviar(partes.join("\n"))
  } catch (e) {
    console.error(
      `[checklist-critico] No se pudo avisar el checklist ${checklistId}: ${e instanceof Error ? e.message : e}`,
    )
  }
}

/** Aviso de que un camión se liberó sin reparar. Nunca tira. */
export async function avisarLiberacionManual(
  dominio: string,
  quien: string,
  motivo: string,
): Promise<void> {
  if (IS_MISIONES) return
  try {
    await enviar(
      `✅ *${dominio}* liberado para salir por ${quien}, sin plan de reparación.\n📝 Motivo: ${motivo}`,
    )
  } catch (e) {
    console.error(
      `[checklist-critico] No se pudo avisar la liberación de ${dominio}: ${e instanceof Error ? e.message : e}`,
    )
  }
}

/**
 * Registra los camiones bloqueados como indisponibles (IND) en
 * `flota_indisponibilidad`: abre la parada el día del checklist y la extiende
 * hasta hoy mientras siga bloqueado. Cuando se libera, el rango deja de crecer
 * y queda como historia. Solo toca filas con motivo «Checklist con crítico…».
 */
export async function syncIndisponibilidadCritica(
  supabase: Admin = createAdminClient(),
  dominio?: string,
): Promise<{ bloqueados: number; abiertas: number; extendidas: number }> {
  if (IS_MISIONES) return { bloqueados: 0, abiertas: 0, extendidas: 0 }
  const hoy = hoyAR()
  const bloqueos = await getBloqueosCriticos(dominio, supabase)
  if (bloqueos.size === 0) return { bloqueados: 0, abiertas: 0, extendidas: 0 }

  // La tabla tiene FK al catálogo: una patente fuera de catálogo no se registra.
  const { data: cat } = await supabase
    .from("catalogo_vehiculos")
    .select("dominio")
    .in("dominio", [...bloqueos.keys()])
  const enCatalogo = new Set(((cat || []) as Array<{ dominio: string }>).map((c) => c.dominio))

  const ayer = new Date(`${hoy}T12:00:00Z`)
  ayer.setUTCDate(ayer.getUTCDate() - 1)
  const ayerIso = ayer.toISOString().slice(0, 10)

  let abiertas = 0
  let extendidas = 0
  for (const b of bloqueos.values()) {
    if (!enCatalogo.has(b.dominio)) continue
    const motivo = `${MOTIVO_IND_CRITICO}: ${[...new Set(b.items.map((i) => i.item))].join(", ")}`
    const desde = b.items.reduce((min, i) => (i.fecha < min ? i.fecha : min), b.items[0].fecha)

    const { data: existente, error: errSel } = await supabase
      .from("flota_indisponibilidad")
      .select("id, fecha_hasta")
      .eq("dominio", b.dominio)
      .like("motivo", `${MOTIVO_IND_CRITICO}%`)
      .gte("fecha_hasta", ayerIso)
      .order("fecha_hasta", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (errSel) throw new Error(errSel.message)

    if (existente) {
      if (existente.fecha_hasta < hoy) {
        const { error } = await supabase
          .from("flota_indisponibilidad")
          .update({ fecha_hasta: hoy, motivo })
          .eq("id", existente.id)
        if (error) throw new Error(error.message)
        extendidas++
      }
    } else {
      const { error } = await supabase.from("flota_indisponibilidad").insert({
        dominio: b.dominio,
        fecha_desde: desde,
        fecha_hasta: hoy < desde ? desde : hoy,
        motivo,
      })
      if (error) throw new Error(error.message)
      abiertas++
    }
  }
  return { bloqueados: bloqueos.size, abiertas, extendidas }
}

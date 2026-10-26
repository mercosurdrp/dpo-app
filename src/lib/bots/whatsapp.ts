// Respuestas por WhatsApp a los bots de pilar: «sí 3», «no 2», «sí 1 y 4»,
// «sí todos». Aprueba o descarta los planes propuestos con ese número. Solo
// se atiende a quien recibe los mensajes de ese bot (su encargado o el
// override de calibración), y se aprueba a nombre del encargado del bot.

import { createAdminClient } from "@/lib/supabase/admin"
import { sendText } from "@/lib/wa-bot/evolution"
import { hoyArgentina } from "@/lib/warehouse/auto-indicadores"
import { aprobarPropuesta, descartarPropuesta } from "./planes"
import { cargarBots, destinosDe, sumarDias } from "./ronda"
import type { BotPlanPropuesto } from "./tipos"

type Admin = ReturnType<typeof createAdminClient>

/** Días hacia atrás en los que un número de plan sigue valiendo. */
const DIAS_VIGENCIA = 7

const ultimos10 = (tel: string) => tel.replace(/\D/g, "").slice(-10)

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

type Orden = { aprobar: boolean; numeros: number[] | "todos" } | { ayuda: true } | null

function interpretar(texto: string): Orden {
  const t = normalizar(texto).replace(/[.!¡]+$/g, "")
  const m = t.match(/^(si|dale|ok|aprobar|aprobado|aprobalo|no|descartar|descartalo)\b\s*(.*)$/)
  if (!m) return null
  const aprobar = !m[1].startsWith("no") && !m[1].startsWith("descart")
  const resto = m[2].trim()
  if (/^(a )?todos?$/.test(resto) || /^(a )?todas?$/.test(resto)) return { aprobar, numeros: "todos" }
  if (resto && /^[\d\s,y-]+$/.test(resto)) {
    const numeros = [...new Set((resto.match(/\d+/g) ?? []).map(Number))]
    if (numeros.length > 0) return { aprobar, numeros }
  }
  // «sí» suelto: no se adivina a cuál se refiere. Un «ok» o «no» suelto puede
  // ser cualquier otra cosa: se deja pasar.
  return /^(ok|dale|no)$/.test(m[1]) ? null : { ayuda: true }
}

export interface RespuestaBots {
  accion: "resuelto" | "ayuda" | "sin_pendientes"
  respuesta: string
}

/**
 * Si el mensaje es una respuesta a un bot de pilar, la procesa, contesta por
 * WhatsApp y devuelve qué hizo. Si no lo es, devuelve null y el webhook sigue
 * su flujo normal.
 */
export async function procesarRespuestaBots(
  supabase: Admin,
  phone: string,
  texto: string,
): Promise<RespuestaBots | null> {
  const orden = interpretar(texto)
  if (!orden) return null

  const bots = (await cargarBots()).filter((b) =>
    destinosDe(b).some((d) => ultimos10(d) === ultimos10(phone)),
  )
  if (bots.length === 0) return null

  const { data, error } = await supabase
    .from("bots_planes_propuestos")
    .select("*")
    .eq("estado", "propuesto")
    .in("bot_key", bots.map((b) => b.key))
    .not("numero", "is", null)
    .gte("fecha", sumarDias(hoyArgentina(), -DIAS_VIGENCIA))
    .order("fecha", { ascending: false })
  if (error) throw new Error(`bots_planes_propuestos: ${error.message}`)
  const pendientes = (data ?? []) as BotPlanPropuesto[]

  let res: RespuestaBots
  if (pendientes.length === 0) {
    res = { accion: "sin_pendientes", respuesta: "No tenés planes propuestos pendientes 👍" }
  } else if ("ayuda" in orden) {
    const lista = pendientes
      .slice(0, 8)
      .map((p) => `*${p.numero}.* ${p.titulo}`)
      .join("\n")
    res = {
      accion: "ayuda",
      respuesta: `Decime el número: *sí 3* para aprobar o *no 3* para descartar (o *sí todos*).\n\nPendientes:\n${lista}`,
    }
  } else {
    // El número más reciente gana: cada día se vuelve a contar desde 1.
    const elegidos: BotPlanPropuesto[] = []
    const noEncontrados: number[] = []
    if (orden.numeros === "todos") {
      const ultimaFecha = pendientes[0].fecha
      elegidos.push(...pendientes.filter((p) => p.fecha === ultimaFecha))
    } else {
      for (const n of orden.numeros) {
        const p = pendientes.find((x) => x.numero === n)
        if (p) elegidos.push(p)
        else noEncontrados.push(n)
      }
    }

    const lineas: string[] = []
    for (const p of elegidos) {
      const bot = bots.find((b) => b.key === p.bot_key)
      const aprobadorId = bot?.encargado_profile_id
      if (!aprobadorId) {
        lineas.push(`⚠️ *${p.numero}.* el bot no tiene encargado cargado: resolvelo desde /bots.`)
        continue
      }
      if (orden.aprobar) {
        const { data: perfil } = await supabase
          .from("profiles")
          .select("nombre")
          .eq("id", aprobadorId)
          .single()
        const nombre = (perfil as { nombre: string } | null)?.nombre ?? "WhatsApp"
        const r = await aprobarPropuesta(supabase, p.id, { id: aprobadorId, nombre })
        lineas.push(
          "error" in r
            ? `⚠️ *${p.numero}.* no se pudo aprobar: ${r.error}`
            : `✅ *${p.numero}.* aprobado: ${p.titulo}. Ya está en Planes.`,
        )
      } else {
        const r = await descartarPropuesta(supabase, p.id, aprobadorId)
        lineas.push(
          "error" in r
            ? `⚠️ *${p.numero}.* no se pudo descartar: ${r.error}`
            : `🗑️ *${p.numero}.* descartado.`,
        )
      }
    }
    for (const n of noEncontrados) lineas.push(`❓ No hay un plan pendiente con el número ${n}.`)
    res = { accion: "resuelto", respuesta: lineas.join("\n") }
  }

  await sendText(phone, res.respuesta).catch(() => null)
  return res
}

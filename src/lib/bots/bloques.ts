// Bloques fijos de la ronda, en el orden del temario de las reuniones de
// Logística (TOR): 1) Seguridad primero, 2) Action log, y recién después los
// resultados del pilar. Los arma el código con los datos tal cual (el modelo
// no los toca), así que no hay números para validar.

import { getPlanesUnificados } from "@/actions/planes-unificados"
import { createAdminClient } from "@/lib/supabase/admin"
import { runAsSystem } from "@/lib/system-context"
import {
  areaLabel,
  cuantosReportes,
  diaCorto,
  diasEntre,
  lineasReportes,
  type Reporte,
  sumarDias,
  ultimoOperativo,
} from "./contexto-seguridad"
import type { BotPilar, BotPlanPropuesto } from "./tipos"

/** Área de los reportes de seguridad que mira cada pilar. */
const AREA_DEL_BOT: Record<string, { area: string; label: string }> = {
  almacen: { area: "deposito", label: "depósito" },
  entrega: { area: "distribucion", label: "distribución" },
  flota: { area: "distribucion", label: "distribución" },
}

const VENTANA_SEMANA = 7
/** Los lunes va la lista completa de vencidos, para la reunión de la semana. */
const MAX_VENCIDOS_LUNES = 10
const MAX_VENCIDOS = 3

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * «Seguridad primero»: días sin accidentes (de toda la operación, como en la
 * Etapa 1 de la reunión) y los reportes del área del pilar desde el último
 * día operativo. El bot de Seguridad no lo lleva: su mensaje ya es esto.
 */
export async function bloqueSeguridad(bot: BotPilar, hoy: string): Promise<string[]> {
  const cfg = AREA_DEL_BOT[bot.key]
  if (!cfg) return []
  const supabase = createAdminClient()
  const desde = sumarDias(hoy, -VENTANA_SEMANA)
  const ayer = ultimoOperativo(hoy)

  const [ultAcc, recientes] = await Promise.all([
    supabase
      .from("reportes_seguridad")
      .select("fecha")
      .eq("tipo", "accidente")
      .lte("fecha", hoy)
      .order("fecha", { ascending: false })
      .limit(1),
    supabase
      .from("reportes_seguridad")
      .select("id, fecha, tipo, sif, area, descripcion")
      .eq("area", cfg.area)
      .gte("fecha", desde)
      .lt("fecha", hoy)
      .order("fecha", { ascending: false }),
  ])
  const err = ultAcc.error ?? recientes.error
  if (err) throw new Error(`seguridad: ${err.message}`)

  const lineas = ["🦺 *Seguridad primero*"]
  const fechaAcc = (ultAcc.data?.[0] as { fecha: string } | undefined)?.fecha
  if (fechaAcc) lineas.push(`• ${diasEntre(fechaAcc.slice(0, 10), hoy)} días sin accidentes`)

  const reportes = ((recientes.data ?? []) as Reporte[]).filter((r) => r.tipo !== "acto_seguro")
  const nuevos = reportes.filter((r) => r.fecha.slice(0, 10) >= ayer)
  if (nuevos.length > 0) {
    lineas.push(`• Reportes en ${cfg.label} desde el ${diaCorto(ayer)}:`, ...lineasReportes(nuevos, { max: 4, sangria: "   " }))
  } else {
    lineas.push(`• Sin reportes en ${cfg.label} desde el ${diaCorto(ayer)}.`)
  }
  // La semana, para ver si algo se repite.
  if (reportes.length > nuevos.length) {
    const porTipo = new Map<string, number>()
    for (const r of reportes) porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1)
    const resumen = [...porTipo]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => cuantosReportes(n, t))
      .join(", ")
    lineas.push(`• Últimos ${VENTANA_SEMANA} días en ${cfg.label}: ${resumen}.`)
  }
  return lineas
}

/**
 * «Action log»: los planes vencidos del encargado en todos los módulos (los
 * mismos de /planes). Si no tiene vencidos no aparece. Solo para los bots
 * cuyo encargado es quien recibe el mensaje (`action_log`): si el encargado
 * es provisorio, mandaría los pendientes de otra persona.
 */
export async function bloqueActionLog(bot: BotPilar, hoy: string): Promise<string[]> {
  if (!bot.action_log || !bot.encargado_profile_id) return []
  const responsableId = bot.encargado_profile_id
  const r = await runAsSystem(`bots:${bot.key}`, () => getPlanesUnificados({ responsableId }))
  if (!("data" in r)) throw new Error(`action log: ${r.error}`)

  const abiertos = r.data.filter((p) => p.estado_unificado !== "cerrada")
  const vencidos = abiertos
    .filter((p) => p.is_overdue && p.fecha_limite)
    .sort((a, b) => (a.fecha_limite! < b.fecha_limite! ? -1 : 1))
  if (vencidos.length === 0) return []

  const lunes = new Date(hoy + "T12:00:00").getDay() === 1
  const max = lunes ? MAX_VENCIDOS_LUNES : MAX_VENCIDOS
  const lineas = [
    `📌 *Tu action log:* ${abiertos.length} ${abiertos.length === 1 ? "abierto" : "abiertos"}, ` +
      `${vencidos.length} ${vencidos.length === 1 ? "vencido" : "vencidos"}.` +
      (lunes ? " Los vencidos:" : " Los más atrasados:"),
    ...vencidos
      .slice(0, max)
      .map((p) => `• ${p.origen_label}: ${p.titulo.replace(/\s+/g, " ").trim()} (venció ${ddmm(p.fecha_limite!)})`),
  ]
  if (vencidos.length > max) lineas.push(`… y ${vencidos.length - max} más en /planes.`)
  return lineas
}

// ---------- reunión de bots ----------

/** Etapa 1 de la reunión: la seguridad de toda la operación. */
export async function seguridadOperacion(hoy: string): Promise<string[]> {
  const supabase = createAdminClient()
  const ayer = ultimoOperativo(hoy)
  const [ultAcc, nuevos] = await Promise.all([
    supabase
      .from("reportes_seguridad")
      .select("fecha")
      .eq("tipo", "accidente")
      .lte("fecha", hoy)
      .order("fecha", { ascending: false })
      .limit(1),
    supabase
      .from("reportes_seguridad")
      .select("tipo, area")
      .neq("tipo", "acto_seguro")
      .gte("fecha", ayer)
      .lt("fecha", hoy),
  ])
  const err = ultAcc.error ?? nuevos.error
  if (err) throw new Error(`seguridad: ${err.message}`)

  const lineas = ["🦺 *Seguridad primero*"]
  const fechaAcc = (ultAcc.data?.[0] as { fecha: string } | undefined)?.fecha
  if (fechaAcc) lineas.push(`• ${diasEntre(fechaAcc.slice(0, 10), hoy)} días sin accidentes`)
  const filas = (nuevos.data ?? []) as Array<{ tipo: string; area: string | null }>
  if (filas.length === 0) {
    lineas.push(`• Sin reportes desde el ${diaCorto(ayer)}.`)
  } else {
    const porTipo = new Map<string, Map<string, number>>()
    for (const f of filas) {
      const areas = porTipo.get(f.tipo) ?? new Map<string, number>()
      const area = areaLabel(f.area)
      areas.set(area, (areas.get(area) ?? 0) + 1)
      porTipo.set(f.tipo, areas)
    }
    lineas.push(`• Reportes desde el ${diaCorto(ayer)}:`)
    for (const [tipo, areas] of porTipo) {
      const n = [...areas.values()].reduce((a, b) => a + b, 0)
      const donde = [...areas].map(([a, k]) => `${k} en ${a}`).join(", ")
      lineas.push(`   • ${cuantosReportes(n, tipo)} (${donde})`)
    }
  }
  return lineas
}

/**
 * Etapa 2 de la reunión: los planes que propusieron los bots en la semana y
 * siguen sin respuesta (se aprueban con «sí N» o desde /bots).
 */
export async function planesPrevios(hoy: string, bots: BotPilar[]): Promise<string[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("bots_planes_propuestos")
    .select("bot_key, fecha, numero, estado")
    .gte("fecha", sumarDias(hoy, -VENTANA_SEMANA))
    .lt("fecha", hoy)
    .order("fecha")
    .order("numero")
  if (error) throw new Error(`planes previos: ${error.message}`)
  const filas = ((data ?? []) as Array<Pick<BotPlanPropuesto, "bot_key" | "fecha" | "numero" | "estado">>)
    .filter((f): f is typeof f & { fecha: string; numero: number } => !!f.fecha && f.numero != null)
  if (filas.length === 0) return []

  const aprobados = filas.filter((f) => f.estado === "aprobado").length
  const pendientes = filas.filter((f) => f.estado === "propuesto")
  const lineas = ["📋 *Planes de días anteriores*"]
  if (aprobados > 0) lineas.push(`• ${aprobados} aprobados en la semana (siguen en /planes).`)
  if (pendientes.length === 0) {
    lineas.push("• Ninguno sin responder.")
    return lineas
  }
  lineas.push(`• ${pendientes.length} sin responder (se aprueban con *sí N* o desde /bots):`)
  for (const b of bots) {
    const suyos = pendientes.filter((f) => f.bot_key === b.key)
    if (suyos.length === 0) continue
    const porDia = new Map<string, number[]>()
    for (const f of suyos) porDia.set(f.fecha, [...(porDia.get(f.fecha) ?? []), f.numero])
    const detalle = [...porDia].map(([f, ns]) => `${ns.map((n) => `#${n}`).join(", ")} del ${ddmm(f)}`).join("; ")
    lineas.push(`   • ${b.emoji} ${b.nombre}: ${detalle}`)
  }
  return lineas
}

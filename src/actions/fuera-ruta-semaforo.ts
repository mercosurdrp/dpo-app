"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { IS_MISIONES } from "@/lib/empresa"
import { createPlanAccion } from "@/actions/gestion"
import { FUERA_RUTA_CHESS_DESDE } from "@/lib/fuera-ruta/chess"
import { hoyArg } from "@/lib/fuera-ruta/sync-chess"
import { esFeriado, esPosteriorAFeriado } from "@/lib/feriados-ar"
import {
  MOTIVOS_FUERA_RUTA,
  NOTA_FECHA_PREFIJO,
  TOLERANCIA_FUERA_RUTA,
  type EstadoDiaFueraRuta,
} from "@/lib/fuera-ruta/semaforo"
import type { PrioridadPlan, EstadoPlan } from "@/types/database"

type Result<T> = { data: T } | { error: string }

const PATH = "/planeamiento/priorizacion-entrega/fuera-de-ruta"
/** Punto 3.3 de Planeamiento: SOP de enrutamiento. Ahí se cuelgan las acciones. */
const PREGUNTA_KEY_RUTEO_3_3 = "3_2_13_41"
const EDITORES = ["admin", "supervisor", "admin_rrhh"]

export interface FueraRutaObservacion {
  id: string
  fecha: string
  motivo: string
  texto: string
  justifica: boolean
  autor_nombre: string | null
  created_by: string | null
  created_at: string
}

export interface FueraRutaAccion {
  id: string
  fecha: string
  descripcion: string
  responsable: string | null
  fecha_limite: string | null
  estado: EstadoPlan
  prioridad: PrioridadPlan
}

export interface FueraRutaDiaSemaforo {
  fecha: string
  estado: EstadoDiaFueraRuta
  /** Entregados fuera de ruta (o, si es hoy/futuro, los que están en el ruteo). */
  pedidos: number
  bultos: number
  /** Justificado sólo por la tolerancia de Logística (1 a 3 pedidos), sin observación. */
  tolerancia: boolean
  posterior_feriado: boolean
  observaciones: number
  acciones_abiertas: number
}

export interface FueraRutaSemaforoMes {
  anio_mes: string
  dias: FueraRutaDiaSemaforo[]
  /** Días con reparto ya cerrados (sin hoy/futuro ni domingos/feriados). */
  dias_evaluados: number
  dias_verdes: number
  dias_justificados: number
  dias_rojos: number
  observaciones: FueraRutaObservacion[]
  acciones: FueraRutaAccion[]
  puede_editar: boolean
  aviso: string | null
}

function diasDelMes(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)
}

async function preguntaRuteoId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("preguntas").select("id").eq("key", PREGUNTA_KEY_RUTEO_3_3).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export async function getFueraRutaSemaforoMes(anioMes: string): Promise<Result<FueraRutaSemaforoMes>> {
  const profile = await requireAuth()
  if (IS_MISIONES) return { error: "Sólo disponible en Pampeana." }
  if (!/^\d{4}-\d{2}$/.test(anioMes)) return { error: "Mes inválido." }

  const supabase = await createClient()
  const fechas = diasDelMes(anioMes)
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]
  const hoy = hoyArg()

  type Reg = { fecha_entrega: string; medida_origen: string | null; bultos_pedido: number | null; bultos: number | null }
  const regs: Reg[] = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase
      .from("fuera_ruta_registros")
      .select("fecha_entrega, medida_origen, bultos_pedido, bultos")
      .gte("fecha_entrega", desde)
      .lte("fecha_entrega", hasta)
      .order("fecha_entrega")
      .range(off, off + 999)
    if (error) return { error: `No se pudo leer el fuera de ruta: ${error.message}` }
    regs.push(...((data ?? []) as Reg[]))
    if ((data ?? []).length < 1000) break
  }

  const [obsRes, pid] = await Promise.all([
    supabase
      .from("fuera_ruta_observaciones")
      .select("id, fecha, motivo, texto, justifica, created_by, created_at, autor:profiles!fuera_ruta_observaciones_created_by_fkey(nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("created_at"),
    preguntaRuteoId(supabase),
  ])
  // Sin la tabla (migración sin aplicar) el semáforo anda igual, sin justificaciones.
  const avisoObs = obsRes.error ? `Observaciones no disponibles: ${obsRes.error.message}` : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const observaciones: FueraRutaObservacion[] = (obsRes.data ?? []).map((o: any) => ({
    id: o.id, fecha: o.fecha, motivo: o.motivo, texto: o.texto, justifica: o.justifica,
    created_by: o.created_by ?? null, created_at: o.created_at,
    autor_nombre: (Array.isArray(o.autor) ? o.autor[0]?.nombre : o.autor?.nombre) ?? null,
  }))

  let acciones: FueraRutaAccion[] = []
  if (pid) {
    const { data, error } = await supabase
      .from("planes_accion")
      .select("id, descripcion, responsable, fecha_limite, estado, prioridad, notas")
      .eq("pregunta_id", pid)
      .like("notas", `${NOTA_FECHA_PREFIJO}${anioMes}%`)
      .order("created_at")
    if (error) return { error: `No se pudieron leer las acciones: ${error.message}` }
    acciones = (data ?? []).map((p) => ({
      id: p.id as string,
      fecha: ((p.notas as string) ?? "").slice(NOTA_FECHA_PREFIJO.length, NOTA_FECHA_PREFIJO.length + 10),
      descripcion: p.descripcion as string,
      responsable: (p.responsable as string | null) ?? null,
      fecha_limite: (p.fecha_limite as string | null) ?? null,
      estado: p.estado as EstadoPlan,
      prioridad: p.prioridad as PrioridadPlan,
    }))
  }

  const dias: FueraRutaDiaSemaforo[] = fechas.map((fecha) => {
    const pendiente = fecha >= hoy
    const esChess = fecha >= FUERA_RUTA_CHESS_DESDE
    // Mismo criterio que el acumulado: en un día pasado de Chess sólo cuenta lo entregado.
    const delDia = regs.filter(
      (r) => r.fecha_entrega === fecha && (!esChess || pendiente || r.medida_origen === "venta"),
    )
    const pedidos = delDia.length
    const bultos = Math.round(delDia.reduce((a, r) => a + Number(r.bultos_pedido ?? r.bultos ?? 0), 0))
    const obsDia = observaciones.filter((o) => o.fecha === fecha)
    const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    const sinReparto = (dow === 0 || esFeriado(fecha)) && pedidos === 0
    let estado: EstadoDiaFueraRuta
    if (sinReparto) estado = "sin_reparto"
    else if (pendiente) estado = "pendiente"
    else if (pedidos === 0) estado = "verde"
    else if (obsDia.some((o) => o.justifica)) estado = "justificado"
    else if (pedidos <= TOLERANCIA_FUERA_RUTA) estado = "justificado"
    else estado = "rojo"
    return {
      fecha, estado, pedidos, bultos,
      tolerancia: estado === "justificado" && !obsDia.some((o) => o.justifica),
      posterior_feriado: esPosteriorAFeriado(fecha),
      observaciones: obsDia.length,
      acciones_abiertas: acciones.filter((a) => a.fecha === fecha && a.estado !== "completado").length,
    }
  })

  const cuenta = (e: EstadoDiaFueraRuta) => dias.filter((d) => d.estado === e).length
  return {
    data: {
      anio_mes: anioMes,
      dias,
      dias_evaluados: cuenta("verde") + cuenta("rojo") + cuenta("justificado"),
      dias_verdes: cuenta("verde"),
      dias_justificados: cuenta("justificado"),
      dias_rojos: cuenta("rojo"),
      observaciones,
      acciones,
      puede_editar: EDITORES.includes(profile.role) && !avisoObs,
      aviso: avisoObs,
    },
  }
}

export async function crearObservacionFueraRuta(input: {
  fecha: string
  motivo: string
  texto: string
  justifica: boolean
}): Promise<{ ok: true } | { error: string }> {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) return { error: "No tenés permiso para cargar observaciones." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { error: "Fecha inválida." }
  if (!MOTIVOS_FUERA_RUTA.some((m) => m.id === input.motivo)) return { error: "Elegí un motivo." }
  if (!input.texto.trim()) return { error: "Escribí la observación." }
  const supabase = await createClient()
  const { error } = await supabase.from("fuera_ruta_observaciones").insert({
    fecha: input.fecha,
    motivo: input.motivo,
    texto: input.texto.trim(),
    justifica: input.justifica,
    created_by: profile.id,
  })
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function eliminarObservacionFueraRuta(id: string): Promise<{ ok: true } | { error: string }> {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) return { error: "No tenés permiso." }
  const supabase = await createClient()
  const { error } = await supabase.from("fuera_ruta_observaciones").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { ok: true }
}

export async function crearAccionFueraRuta(input: {
  fecha: string
  descripcion: string
  responsable: string
  fecha_limite?: string
  prioridad?: PrioridadPlan
}): Promise<{ ok: true } | { error: string }> {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) return { error: "No tenés permiso para crear acciones." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { error: "Fecha inválida." }
  if (!input.descripcion.trim()) return { error: "La descripción es obligatoria." }
  if (!input.responsable.trim()) return { error: "El responsable es obligatorio." }
  const supabase = await createClient()
  const pid = await preguntaRuteoId(supabase)
  if (!pid) return { error: "No se encontró el punto 3.3 de Planeamiento en el manual DPO." }
  const res = await createPlanAccion({
    pregunta_id: pid,
    descripcion: input.descripcion.trim(),
    responsable: input.responsable.trim(),
    fecha_limite: input.fecha_limite || undefined,
    prioridad: input.prioridad ?? "media",
    notas: `${NOTA_FECHA_PREFIJO}${input.fecha} · Fuera de ruta`,
  })
  if ("error" in res) return { error: res.error }
  revalidatePath(PATH)
  return { ok: true }
}

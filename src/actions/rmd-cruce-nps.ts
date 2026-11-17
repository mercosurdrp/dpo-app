"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"

/**
 * Cruce RMD × NPS: clientes que en el año votaron RMD detractor (1-3) o
 * pasivo (4) y que también tienen encuestas NPS. Se marca si en NPS eligieron
 * un motivo logístico (driver «Experiencia de entrega»).
 *
 * Ojo: los drivers de NPS los eligen todos, también los promotores. En un
 * promotor el driver es lo que le GUSTA, no una queja. Por eso se separa
 * «coincide» (NPS detractor/pasivo con motivo logístico) de «destaca»
 * (sólo promotores que eligieron la entrega).
 */

type Result<T> = { data: T } | { error: string }

const RMD_PATH = "/rmd"
const EDITORES = ["admin", "supervisor", "admin_rrhh"]
const PAGE = 1000
/** cod_cliente reservado para la observación general del análisis. */
const COD_GENERAL = 0

export type CruceGrupo = "coincide" | "destaca" | "bajo_sin_logistico" | "sin_logistico"

export interface CruceRmdVoto {
  fecha: string
  puntuacion: number
  motivo: string | null
  comentario: string | null
}

export interface CruceNpsEncuesta {
  fecha: string
  score: number
  categoria: string
  /** Subdrivers (o driver) logísticos que eligió en esa encuesta. */
  logisticos: string[]
  /** Resto de los drivers primarios que eligió. */
  otros: string[]
  comentario: string | null
}

export interface CruceObservacion {
  id: string
  cod_cliente: number
  texto: string
  created_at: string
  autor_nombre: string | null
}

export interface CruceCliente {
  cod_cliente: number
  nombre: string | null
  localidad: string | null
  grupo: CruceGrupo
  rmd: CruceRmdVoto[]
  nps: CruceNpsEncuesta[]
  observaciones: CruceObservacion[]
}

export interface RmdCruceNpsData {
  anio: number
  clientes_rmd_bajo: number
  clientes_con_nps: number
  clientes: CruceCliente[]
  observaciones_generales: CruceObservacion[]
  /** Aviso si la tabla de observaciones todavía no existe. */
  aviso_observaciones: string | null
}

function esLogistico(primario: string | null, sub: string | null): boolean {
  if (primario === "Experiencia de entrega") return true
  // Mismo tema dentro de la app BEES
  return sub === "Consigo acompañar el estado de la entrega"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapObs(o: any): CruceObservacion {
  return {
    id: o.id,
    cod_cliente: Number(o.cod_cliente),
    texto: o.texto,
    created_at: o.created_at,
    autor_nombre: (Array.isArray(o.autor) ? o.autor[0]?.nombre : o.autor?.nombre) ?? null,
  }
}

export async function getRmdCruceNps(anio = 2026): Promise<Result<RmdCruceNpsData>> {
  try {
    await requireAuth()
    const supabase = await createClient()

    // ---- votos RMD bajos (1-4) del año ----
    const votos: Array<{
      cod_cliente: number
      nombre_cliente: string | null
      localidad: string | null
      fecha_puntuacion: string
      puntuacion: number
      motivos: string | null
      comentario: string | null
    }> = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from("nps_rmd_cliente")
        .select("cod_cliente, nombre_cliente, localidad, fecha_puntuacion, puntuacion, motivos, comentario")
        .lte("puntuacion", 4)
        .gte("fecha_puntuacion", `${anio}-01-01`)
        .lt("fecha_puntuacion", `${anio + 1}-01-01`)
        .order("fecha_puntuacion", { ascending: true })
        .range(desde, desde + PAGE - 1)
      if (error) return { error: `No se pudo leer RMD: ${error.message}` }
      votos.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }

    const rmdPorCliente = new Map<number, { nombre: string | null; localidad: string | null; votos: CruceRmdVoto[] }>()
    for (const v of votos) {
      const cod = Number(v.cod_cliente)
      const c = rmdPorCliente.get(cod) ?? { nombre: v.nombre_cliente, localidad: v.localidad, votos: [] }
      c.votos.push({
        fecha: v.fecha_puntuacion.slice(0, 10),
        puntuacion: v.puntuacion,
        motivo: v.motivos?.trim() || null,
        comentario: v.comentario?.trim() || null,
      })
      rmdPorCliente.set(cod, c)
    }

    const codigos = [...rmdPorCliente.keys()]
    const [npsRes, obsRes] = await Promise.all([
      codigos.length
        ? supabase
            .from("nps_encuestas")
            .select("fecha_enc, cod_cliente, score, categoria, driver_primario, drivers, comentario")
            .in("cod_cliente", codigos)
            .order("fecha_enc", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("rmd_cruce_nps_observaciones")
        .select("id, cod_cliente, texto, created_at, autor:profiles!rmd_cruce_nps_observaciones_created_by_fkey(nombre)")
        .order("created_at", { ascending: true }),
    ])
    if (npsRes.error) return { error: `No se pudo leer NPS: ${npsRes.error.message}` }

    // Sin la tabla (migración sin aplicar) el cruce se ve igual, sin observaciones.
    const aviso_observaciones = obsRes.error
      ? `Las observaciones todavía no están disponibles (${obsRes.error.message}).`
      : null
    const obs = (obsRes.data ?? []).map(mapObs)
    const obsPorCliente = new Map<number, CruceObservacion[]>()
    for (const o of obs) {
      const l = obsPorCliente.get(o.cod_cliente) ?? []
      l.push(o)
      obsPorCliente.set(o.cod_cliente, l)
    }

    const npsPorCliente = new Map<number, CruceNpsEncuesta[]>()
    for (const e of npsRes.data ?? []) {
      const pares: Array<[string | null, string | null]> =
        Array.isArray(e.drivers) && e.drivers.length ? e.drivers : [[e.driver_primario, null]]
      const logisticos = new Set<string>()
      const otros = new Set<string>()
      for (const [p, s] of pares) {
        if (esLogistico(p, s)) logisticos.add(s ?? p ?? "Experiencia de entrega")
        else if (p) otros.add(p)
      }
      const cod = Number(e.cod_cliente)
      const l = npsPorCliente.get(cod) ?? []
      l.push({
        fecha: String(e.fecha_enc).slice(0, 10),
        score: e.score,
        categoria: e.categoria,
        logisticos: [...logisticos],
        otros: [...otros],
        comentario: e.comentario?.trim() || null,
      })
      npsPorCliente.set(cod, l)
    }

    const clientes: CruceCliente[] = []
    for (const [cod, c] of rmdPorCliente) {
      const nps = npsPorCliente.get(cod)
      if (!nps?.length) continue
      const bajoLog = nps.some((e) => e.categoria !== "Promoter" && e.logisticos.length > 0)
      const promLog = nps.some((e) => e.categoria === "Promoter" && e.logisticos.length > 0)
      const npsBajo = nps.some((e) => e.categoria !== "Promoter")
      const grupo: CruceGrupo = bajoLog
        ? "coincide"
        : promLog
          ? "destaca"
          : npsBajo
            ? "bajo_sin_logistico"
            : "sin_logistico"
      clientes.push({
        cod_cliente: cod,
        nombre: c.nombre,
        localidad: c.localidad,
        grupo,
        rmd: c.votos,
        nps,
        observaciones: obsPorCliente.get(cod) ?? [],
      })
    }
    clientes.sort((a, b) => (b.rmd.at(-1)?.fecha ?? "").localeCompare(a.rmd.at(-1)?.fecha ?? ""))

    return {
      data: {
        anio,
        clientes_rmd_bajo: rmdPorCliente.size,
        clientes_con_nps: clientes.length,
        clientes,
        observaciones_generales: obsPorCliente.get(COD_GENERAL) ?? [],
        aviso_observaciones,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" }
  }
}

export async function agregarObservacionCruceNps(
  codCliente: number,
  texto: string,
): Promise<Result<CruceObservacion>> {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) return { error: "No tenés permiso para dejar observaciones." }
  const limpio = texto.trim()
  if (!limpio) return { error: "La observación está vacía." }
  if (!Number.isInteger(codCliente) || codCliente < 0) return { error: "Cliente inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rmd_cruce_nps_observaciones")
    .insert({ cod_cliente: codCliente, texto: limpio, created_by: profile.id })
    .select("id, cod_cliente, texto, created_at, autor:profiles!rmd_cruce_nps_observaciones_created_by_fkey(nombre)")
    .single()
  if (error) return { error: error.message }
  revalidatePath(RMD_PATH)
  return { data: mapObs(data) }
}

export async function eliminarObservacionCruceNps(id: string): Promise<{ ok: true } | { error: string }> {
  const profile = await requireAuth()
  if (!EDITORES.includes(profile.role)) return { error: "No tenés permiso." }
  const supabase = await createClient()
  const { error } = await supabase.from("rmd_cruce_nps_observaciones").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(RMD_PATH)
  return { ok: true }
}

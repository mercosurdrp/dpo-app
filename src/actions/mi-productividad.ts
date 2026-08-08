"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { esDelOperario, resolverOperarioWms } from "@/lib/deposito/operario-wms"
import {
  agregarProductividad,
  type ClasificacionEnvaseRow,
  type ProductividadDia,
  type ProductividadTotales,
} from "@/lib/clasificacion-envases"

// Fuentes de depósito. Las tres viven en deposito-esteban salvo envases, que
// es tabla propia de este mismo portal.
const PICKING_URL =
  "https://deposito-esteban.vercel.app/api/shared/load?module=productividad-picking"
const MINUTOS_URL: Record<Tramo, string> = {
  carga: "https://deposito-esteban.vercel.app/api/carga/tiempos",
  descarga: "https://deposito-esteban.vercel.app/api/acarreo/descargas",
}

const TIMEOUT_MS = 10_000

export type Tramo = "carga" | "descarga"

export interface DiaPicking {
  fecha: string
  bul_hh: number
  grupo: string | null
}

export interface ResumenPicking {
  dias: DiaPicking[]
  /** Promedio simple de los días trabajados: es el bul/HH típico de la persona. */
  promedio: number
  mejor: DiaPicking | null
}

export interface DiaMinutos {
  fecha: string
  camiones: number
  minutos: number
  min_camion: number
  pallets: number
  /** Sólo descarga: cuántos de esos camiones se hicieron entre dos. */
  en_equipo: number
}

export interface ResumenTramo {
  dias: DiaMinutos[]
  camiones: number
  minutos: number
  /** Minutos totales / camiones totales. Acá MENOS es mejor. */
  min_camion: number
  pallets: number
  en_equipo: number
}

export interface ResumenEnvases {
  dias: ProductividadDia[]
  totales: ProductividadTotales
}

export interface MiProductividad {
  /** Nombre del perfil logueado. */
  nombre: string
  /** Nombre con el que figura en el WMS, o null si no se pudo resolver. */
  operario: string | null
  /** Mes consultado, "YYYY-MM". */
  mes: string
  picking: ResumenPicking | null
  carga: ResumenTramo | null
  descarga: ResumenTramo | null
  envases: ResumenEnvases | null
  /** true si alguna fuente externa falló: la pantalla lo aclara. */
  parcial: boolean
}

type Result<T> = { data: T } | { error: string }

/** Fecha de hoy en hora Argentina (UTC-3, sin DST). */
function hoyARG(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function mesValido(ym?: string): string {
  return ym && /^\d{4}-\d{2}$/.test(ym) ? ym : hoyARG().slice(0, 7)
}

/** Primer y último día del mes, en YYYY-MM-DD. */
function rangoDelMes(ym: string): { desde: string; hasta: string } {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10))
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { desde: `${ym}-01`, hasta: `${ym}-${String(ultimo).padStart(2, "0")}` }
}

function round(n: number, dec = 1): number {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    // Best-effort: una fuente caída no puede tirar abajo la pantalla entera.
    return null
  }
}

// ── Picking (bultos por hora) ──────────────────────────────────────────────

interface FilaPickingApi {
  fecha?: string
  operario?: string
  bul_hh?: number
  grupo?: string
}

/**
 * Además del resumen de la persona, devuelve el listado completo de operarios
 * del blob: es lo que se usa para resolver a quién corresponde el usuario.
 */
async function leerPicking(
  mes: string,
): Promise<{ operarios: string[]; filas: FilaPickingApi[] } | null> {
  const json = await getJson<{ data?: { filas?: FilaPickingApi[] } }>(PICKING_URL)
  if (!json) return null
  const filas = json.data?.filas ?? []
  const operarios = Array.from(
    new Set(filas.map((f) => String(f.operario ?? "").trim()).filter(Boolean)),
  )
  return {
    operarios,
    filas: filas.filter((f) => String(f.fecha ?? "").startsWith(mes)),
  }
}

function resumirPicking(filas: FilaPickingApi[], operario: string): ResumenPicking | null {
  const dias: DiaPicking[] = []
  for (const f of filas) {
    if (!esDelOperario(String(f.operario ?? ""), operario)) continue
    const bh = Number(f.bul_hh)
    if (!Number.isFinite(bh) || bh <= 0) continue
    dias.push({ fecha: String(f.fecha), bul_hh: Math.round(bh), grupo: f.grupo ?? null })
  }
  if (dias.length === 0) return null
  dias.sort((a, b) => a.fecha.localeCompare(b.fecha))
  const suma = dias.reduce((s, d) => s + d.bul_hh, 0)
  const mejor = dias.reduce((best, d) => (!best || d.bul_hh > best.bul_hh ? d : best), null as DiaPicking | null)
  return { dias, promedio: Math.round(suma / dias.length), mejor }
}

// ── Maquinistas (minutos por camión) ───────────────────────────────────────

interface FilaMinutosApi {
  operario?: string
  fecha?: string
  pallets?: number
  minutos?: number
  camiones?: number
  min_camion?: number
  en_equipo?: number
}

/**
 * Un tramo (carga o descarga) para una persona. El promedio del mes se calcula
 * como minutos totales / camiones totales, NO como promedio de los promedios
 * diarios: un día de un solo camión no puede pesar lo mismo que uno de ocho.
 */
async function leerTramo(
  tramo: Tramo,
  mes: string,
  operario: string | null,
): Promise<{ operarios: string[]; resumen: ResumenTramo | null } | null> {
  const { desde, hasta } = rangoDelMes(mes)
  const json = await getJson<{ filas?: FilaMinutosApi[] }>(
    `${MINUTOS_URL[tramo]}?desde=${desde}&hasta=${hasta}`,
  )
  if (!json) return null
  const filas = json.filas ?? []
  const operarios = Array.from(
    new Set(filas.map((f) => String(f.operario ?? "").trim()).filter(Boolean)),
  )
  if (!operario) return { operarios, resumen: null }

  const dias: DiaMinutos[] = []
  for (const f of filas) {
    if (!esDelOperario(String(f.operario ?? ""), operario)) continue
    const camiones = Number(f.camiones) || 0
    if (camiones <= 0) continue
    dias.push({
      fecha: String(f.fecha),
      camiones,
      minutos: round(Number(f.minutos) || 0),
      min_camion: round(Number(f.min_camion) || 0),
      pallets: Number(f.pallets) || 0,
      en_equipo: Number(f.en_equipo) || 0,
    })
  }
  if (dias.length === 0) return { operarios, resumen: null }
  dias.sort((a, b) => a.fecha.localeCompare(b.fecha))

  const camiones = dias.reduce((s, d) => s + d.camiones, 0)
  const minutos = dias.reduce((s, d) => s + d.minutos, 0)
  return {
    operarios,
    resumen: {
      dias,
      camiones,
      minutos: round(minutos),
      min_camion: camiones > 0 ? round(minutos / camiones) : 0,
      pallets: dias.reduce((s, d) => s + d.pallets, 0),
      en_equipo: dias.reduce((s, d) => s + d.en_equipo, 0),
    },
  }
}

// ── Clasificación de envases ───────────────────────────────────────────────

/**
 * Acá no hace falta resolver nombres: la tabla guarda el id del perfil que
 * cargó cada tarea, así que se filtra por el usuario logueado y listo.
 */
async function leerEnvases(profileId: string, mes: string): Promise<ResumenEnvases | null> {
  const { desde, hasta } = rangoDelMes(mes)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("clasificacion_envases")
    .select("fecha, hora_inicio, hora_fin, pallets_total, pallets_rotos, cajones_total, cajones_rotos, botellas_rotas")
    .eq("creado_por", profileId)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true })

  if (error || !data || data.length === 0) return null
  const rows = data as ClasificacionEnvaseRow[]
  const agg = agregarProductividad(rows, desde, hasta)
  return { dias: agg.serie, totales: agg.totales }
}

// ── Acción ─────────────────────────────────────────────────────────────────

/**
 * Todo lo que el usuario logueado hizo en el depósito durante un mes.
 *
 * No hay "grupos": una misma persona puede pickear un día, manejar la máquina
 * al otro y clasificar envases al siguiente. Se devuelve un bloque por cada
 * cosa donde tenga datos, y los que no, van en null para que la pantalla ni
 * los muestre.
 */
export async function getMiProductividad(ym?: string): Promise<Result<MiProductividad>> {
  try {
    const profile = await requireAuth()
    const mes = mesValido(ym)
    const nombre = String(profile.nombre ?? "").trim()

    const [picking, cargaRaw, descargaRaw, envases] = await Promise.all([
      leerPicking(mes),
      leerTramo("carga", mes, null),
      leerTramo("descarga", mes, null),
      leerEnvases(profile.id, mes),
    ])

    // El universo de nombres del WMS sale de las tres fuentes externas juntas:
    // alguien puede no haber pickeado nunca y sí aparecer como maquinista.
    const universo = new Set<string>([
      ...(picking?.operarios ?? []),
      ...(cargaRaw?.operarios ?? []),
      ...(descargaRaw?.operarios ?? []),
    ])
    const operario = nombre ? resolverOperarioWms(nombre, universo) : null

    // Los tramos se releen sólo si hay operario resuelto (la primera pasada era
    // para juntar nombres). Es la misma URL, así que sale del cache de fetch.
    const [carga, descarga] = operario
      ? await Promise.all([leerTramo("carga", mes, operario), leerTramo("descarga", mes, operario)])
      : [null, null]

    return {
      data: {
        nombre,
        operario,
        mes,
        picking: operario && picking ? resumirPicking(picking.filas, operario) : null,
        carga: carga?.resumen ?? null,
        descarga: descarga?.resumen ?? null,
        envases,
        parcial: !picking || !cargaRaw || !descargaRaw,
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

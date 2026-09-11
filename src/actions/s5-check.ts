"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { escribirClave, leerClave, leerPrefijo } from "@/lib/clima-store"
import {
  itemsDelSector,
  type AdherenciaCheck,
  type FrecuenciaCheck,
  type ItemCronograma,
} from "@/lib/s5-cronograma"

/**
 * Check de limpieza 5S (ítem 18 de la auditoría: "¿la limpieza es monitoreada
 * con check?"). Reemplaza la planilla en papel de la cartelera.
 *
 * Está al revés de un checklist común: **todo se da por hecho**. El
 * responsable del sector no tilda nada al cerrar el turno (no tiene tiempo);
 * el que hace la recorrida marca lo que NO se hizo, y eso es lo único que se
 * guarda. Un día sin faltas es un día completo. Cada día cierra solo: hoy está
 * "en curso", ayer ya cuenta.
 *
 * Sin tabla propia, igual que Clima y los artículos de limpieza: cada día con
 * faltas de cada sector es una clave de `app_config`:
 *
 *   s5:falta:<sector>:<YYYY-MM-DD> → { items: { <item_id>: { por, at } } }
 *
 * Los ítems semanales, quincenales y mensuales se marcan en el día de la
 * recorrida y la falta vale para toda su ventana (la semana, la quincena, el
 * mes).
 *
 * Quién marca: admin y auditor. Se valida acá, antes de escribir con la
 * service role.
 */

const PREFIJO = "s5:falta:"
const TZ = "America/Argentina/Buenos_Aires"
const MI_PATH = "/mi-5s"
const DASHBOARD_PATH = "/5s"
const PANEL_PATH = "/5s/sectores"
/** Hasta cuántos días atrás se puede cargar una recorrida. */
const DIAS_ATRAS_MAX = 45
const ROLES_RECORRIDA = ["admin", "auditor"]

interface FaltasDia {
  items: Record<string, { por: string; at: string }>
}

export interface FaltaRegistrada {
  fecha: string
  item_id: string
  texto: string
  frecuencia: FrecuenciaCheck
  por: string
}

export interface EstadoItemCheck extends ItemCronograma {
  /** Marcado como no hecho en la fecha consultada (o en su ventana). */
  falta: boolean
  falta_por: string | null
  falta_el: string | null
}

/** Cumplimiento del cronograma de un sector en un mes, para Indicadores. */
export interface CumplimientoSector {
  sector: number
  nombre: string
  adherencia: AdherenciaCheck
}

export interface CheckSector {
  sector: number
  hoy: string
  /** Fecha consultada (la de la recorrida). */
  fecha: string
  items: EstadoItemCheck[]
  adherencia: AdherenciaCheck
  /** Todas las faltas del mes de `fecha`, para listarlas. */
  faltas_mes: FaltaRegistrada[]
}

// ===================================================
// Fechas (todo en YYYY-MM-DD, sin objetos Date con zona)
// ===================================================

/** Hoy en Argentina: el server corre en UTC y de noche cambia el día. */
function hoyLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function partes(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number)
  return [y, m, d]
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function sumarDias(fecha: string, delta: number): string {
  const [y, m, d] = partes(fecha)
  const t = new Date(Date.UTC(y, m - 1, d + delta))
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** 0 = domingo … 6 = sábado. */
function diaSemana(fecha: string): number {
  const [y, m, d] = partes(fecha)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function ultimoDiaDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Ventana [desde, hasta] que contiene a `fecha` para esa frecuencia. */
function ventana(frecuencia: FrecuenciaCheck, fecha: string): [string, string] {
  const [y, m, d] = partes(fecha)
  const fin = ultimoDiaDelMes(y, m)
  switch (frecuencia) {
    case "diaria":
      return [fecha, fecha]
    case "semanal": {
      // Lunes a domingo.
      const dow = diaSemana(fecha)
      const lunes = sumarDias(fecha, dow === 0 ? -6 : 1 - dow)
      return [lunes, sumarDias(lunes, 6)]
    }
    case "quincenal":
      return d <= 15 ? [iso(y, m, 1), iso(y, m, 15)] : [iso(y, m, 16), iso(y, m, fin)]
    case "mensual":
      return [iso(y, m, 1), iso(y, m, fin)]
  }
}

// ===================================================
// Lectura
// ===================================================

function clave(sector: number, fecha: string): string {
  return `${PREFIJO}${sector}:${fecha}`
}

/** Todos los días con faltas de un sector en un mes (YYYY-MM). */
async function leerMes(sector: number, yyyymm: string): Promise<Map<string, FaltasDia>> {
  const out = new Map<string, FaltasDia>()
  const res = await leerPrefijo(`${PREFIJO}${sector}:${yyyymm}-`)
  if ("error" in res) return out
  for (const fila of res.data) {
    try {
      const dia = JSON.parse(fila.valor) as FaltasDia
      out.set(fila.clave.slice(fila.clave.lastIndexOf(":") + 1), dia)
    } catch {
      // Una clave ilegible no voltea el check entero.
    }
  }
  return out
}

function estadoDeItems(
  items: ItemCronograma[],
  mes: Map<string, FaltasDia>,
  fecha: string
): EstadoItemCheck[] {
  return items.map((item) => {
    const [desde, hasta] = ventana(item.frecuencia, fecha)
    let falta_el: string | null = null
    let falta_por: string | null = null
    for (const [f, dia] of mes) {
      if (f < desde || f > hasta) continue
      const marca = dia.items[item.id]
      if (marca && (!falta_el || f > falta_el)) {
        falta_el = f
        falta_por = marca.por
      }
    }
    return { ...item, falta: falta_el !== null, falta_por, falta_el }
  })
}

function faltasDelMes(items: ItemCronograma[], mes: Map<string, FaltasDia>): FaltaRegistrada[] {
  const porId = new Map(items.map((i) => [i.id, i]))
  const out: FaltaRegistrada[] = []
  for (const [fecha, dia] of mes) {
    for (const [id, marca] of Object.entries(dia.items)) {
      const item = porId.get(id)
      if (!item) continue
      out.push({ fecha, item_id: id, texto: item.texto, frecuencia: item.frecuencia, por: marca.por })
    }
  }
  out.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.texto.localeCompare(b.texto))
  return out
}

/**
 * Cumplimiento del mes. Cuenta lunes a sábado desde el día 1 hasta AYER (hoy
 * todavía está en curso), o hasta fin de mes si el mes ya cerró. Un día está
 * completo cuando ningún ítem diario del sector quedó marcado como no hecho.
 */
function calcularAdherencia(
  items: ItemCronograma[],
  mes: Map<string, FaltasDia>,
  periodo: string,
  hoy: string
): AdherenciaCheck {
  const [y, m] = partes(periodo)
  const fin = iso(y, m, ultimoDiaDelMes(y, m))
  const ayer = sumarDias(hoy, -1)
  const hasta = ayer < fin ? ayer : fin
  const diarios = items.filter((i) => i.frecuencia === "diaria")
  const periodicos = items.filter((i) => i.frecuencia !== "diaria")

  let dias = 0
  let completos = 0
  if (hasta >= iso(y, m, 1)) {
    for (let f = iso(y, m, 1); f <= hasta; f = sumarDias(f, 1)) {
      if (diaSemana(f) === 0) continue
      dias += 1
      const dia = mes.get(f)
      if (!dia || diarios.every((i) => !dia.items[i.id])) completos += 1
    }
  }

  const conFalta = new Set<string>()
  for (const dia of mes.values()) {
    for (const id of Object.keys(dia.items)) conFalta.add(id)
  }

  return {
    dias,
    dias_completos: completos,
    pct: dias > 0 ? Math.round((completos / dias) * 100) : null,
    periodicos_hechos: periodicos.filter((i) => !conFalta.has(i.id)).length,
    periodicos_total: periodicos.length,
  }
}

async function armarCheck(sector: number, fecha: string, hoy: string): Promise<CheckSector> {
  const items = itemsDelSector(sector)
  const mes = await leerMes(sector, fecha.slice(0, 7))
  return {
    sector,
    hoy,
    fecha,
    items: estadoDeItems(items, mes, fecha),
    adherencia: calcularAdherencia(items, mes, `${fecha.slice(0, 7)}-01`, hoy),
    faltas_mes: faltasDelMes(items, mes),
  }
}

function fechaValida(fecha: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Fecha inválida."
  if (fecha > hoy) return "No se puede cargar una recorrida a futuro."
  if (fecha < sumarDias(hoy, -DIAS_ATRAS_MAX)) return "Esa fecha ya quedó muy atrás."
  return null
}

/** El cronograma de un sector con las faltas de una fecha (por defecto hoy). */
export async function getCheckSector(
  sector: number,
  fecha?: string
): Promise<{ data: CheckSector } | { error: string }> {
  try {
    await requireAuth()
    const hoy = hoyLocal()
    const f = fecha ?? hoy
    const err = fechaValida(f, hoy)
    if (err) return { error: err }
    return { data: await armarCheck(sector, f, hoy) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el check" }
  }
}

/** Los cuatro sectores de una vez, para la página 5S. */
export async function getCheckSectores(
  sectores: number[],
  fecha?: string
): Promise<{ data: CheckSector[] } | { error: string }> {
  try {
    await requireAuth()
    const hoy = hoyLocal()
    const f = fecha ?? hoy
    const err = fechaValida(f, hoy)
    if (err) return { error: err }
    return { data: await Promise.all(sectores.map((s) => armarCheck(s, f, hoy))) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el check" }
  }
}

/** Para el auditor: cumplimiento de un sector en un mes (periodo = YYYY-MM-01). */
export async function getAdherenciaCheck(
  periodo: string,
  sector: number
): Promise<AdherenciaCheck> {
  const items = itemsDelSector(sector)
  const mes = await leerMes(sector, periodo.slice(0, 7))
  return calcularAdherencia(items, mes, periodo, hoyLocal())
}

/** Indicadores: cumplimiento del cronograma de cada sector en un mes (periodo = YYYY-MM-01). */
export async function getCumplimientoSectores(
  periodo: string
): Promise<{ data: CumplimientoSector[] } | { error: string }> {
  try {
    await requireAuth()
    const { data: sectores, error } = await createAdminClient()
      .from("s5_sectores_almacen")
      .select("numero, nombre")
      .order("numero")
    if (error) return { error: error.message }
    const hoy = hoyLocal()
    const filas = (sectores ?? []) as { numero: number; nombre: string | null }[]
    const data = await Promise.all(
      filas.map(async (s) => {
        const items = itemsDelSector(s.numero)
        const mes = await leerMes(s.numero, periodo.slice(0, 7))
        return {
          sector: s.numero,
          nombre: s.nombre ?? `Sector ${s.numero}`,
          adherencia: calcularAdherencia(items, mes, periodo, hoy),
        }
      })
    )
    return { data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error cargando el cumplimiento" }
  }
}

// ===================================================
// Escritura: marcar / desmarcar una falta
// ===================================================

export async function marcarFalta(input: {
  sector: number
  itemId: string
  /** YYYY-MM-DD de la recorrida. */
  fecha: string
  /** true = "no se hizo"; false = lo saca (se hizo después de todo). */
  falta: boolean
}): Promise<{ data: CheckSector } | { error: string }> {
  try {
    const profile = await requireAuth()
    if (!ROLES_RECORRIDA.includes(profile.role)) {
      return { error: "Las faltas del check las carga quien hace la recorrida (admin o auditor)." }
    }
    const hoy = hoyLocal()
    const err = fechaValida(input.fecha, hoy)
    if (err) return { error: err }

    const items = itemsDelSector(input.sector)
    const item = items.find((i) => i.id === input.itemId)
    if (!item) return { error: "Ese ítem no está en el cronograma del sector." }

    const k = clave(input.sector, input.fecha)
    const dia = (await leerClave<FaltasDia>(k)) ?? { items: {} }
    if (input.falta) {
      dia.items[item.id] = { por: profile.nombre, at: new Date().toISOString() }
    } else {
      // Si la falta de un periódico se cargó otro día de la misma ventana,
      // hay que sacarla de ese día, no de éste.
      const mes = await leerMes(input.sector, input.fecha.slice(0, 7))
      const [desde, hasta] = ventana(item.frecuencia, input.fecha)
      for (const [f, d] of mes) {
        if (f < desde || f > hasta || !d.items[item.id]) continue
        delete d.items[item.id]
        const r = await escribirClave(clave(input.sector, f), d, profile.id)
        if ("error" in r) return { error: r.error }
      }
      delete dia.items[item.id]
    }
    const res = await escribirClave(k, dia, profile.id)
    if ("error" in res) return { error: res.error }

    revalidatePath(MI_PATH)
    revalidatePath(DASHBOARD_PATH)
    revalidatePath(PANEL_PATH)
    return { data: await armarCheck(input.sector, input.fecha, hoy) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando la recorrida" }
  }
}

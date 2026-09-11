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
 * Check diario de limpieza 5S (ítem 18 de la auditoría: "¿la limpieza es
 * monitoreada con check?"). Reemplaza la planilla en papel de la cartelera.
 *
 * Sin tabla propia, igual que Clima y los artículos de limpieza: cada día de
 * cada sector es una clave de `app_config`:
 *
 *   s5:check:<sector>:<YYYY-MM-DD> → { items: { <item_id>: { por, at } } }
 *
 * Un ítem presente está hecho; ausente, no. Los ítems semanales, quincenales y
 * mensuales se guardan en el día en que se hicieron y la pantalla los da por
 * cumplidos mientras dure su ventana (la semana, la quincena, el mes).
 *
 * Quién puede tildar: el responsable 5S del sector ese mes (desde Mi 5S) y
 * admin / auditor / supervisor. Se valida acá, antes de escribir con la
 * service role.
 */

const PREFIJO = "s5:check:"
const TZ = "America/Argentina/Buenos_Aires"
const MI_PATH = "/mi-5s"
const PANEL_PATH = "/5s/sectores"

interface CheckDia {
  items: Record<string, { por: string; at: string }>
}

export interface EstadoItemCheck extends ItemCronograma {
  hecho: boolean
  hecho_por: string | null
  /** YYYY-MM-DD en que se tildó (el último dentro de la ventana). */
  hecho_el: string | null
}

export interface CheckSector {
  sector: number
  hoy: string
  items: EstadoItemCheck[]
  adherencia: AdherenciaCheck
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

/** Todos los días guardados de un sector en un mes (YYYY-MM). */
async function leerMes(sector: number, yyyymm: string): Promise<Map<string, CheckDia>> {
  const out = new Map<string, CheckDia>()
  const res = await leerPrefijo(`${PREFIJO}${sector}:${yyyymm}-`)
  if ("error" in res) return out
  for (const fila of res.data) {
    try {
      const dia = JSON.parse(fila.valor) as CheckDia
      out.set(fila.clave.slice(fila.clave.lastIndexOf(":") + 1), dia)
    } catch {
      // Una clave ilegible no voltea el check entero.
    }
  }
  return out
}

function estadoDeItems(
  items: ItemCronograma[],
  mes: Map<string, CheckDia>,
  hoy: string
): EstadoItemCheck[] {
  return items.map((item) => {
    const [desde, hasta] = ventana(item.frecuencia, hoy)
    let hecho_el: string | null = null
    let hecho_por: string | null = null
    for (const [fecha, dia] of mes) {
      if (fecha < desde || fecha > hasta) continue
      const marca = dia.items[item.id]
      if (marca && (!hecho_el || fecha > hecho_el)) {
        hecho_el = fecha
        hecho_por = marca.por
      }
    }
    return { ...item, hecho: hecho_el !== null, hecho_por, hecho_el }
  })
}

/**
 * Cumplimiento del mes. Cuenta lunes a sábado desde el día 1 hasta hoy (o
 * hasta fin de mes si el mes ya cerró); un día está completo cuando todos los
 * ítems diarios del sector quedaron tildados.
 */
function calcularAdherencia(
  items: ItemCronograma[],
  mes: Map<string, CheckDia>,
  periodo: string,
  hoy: string
): AdherenciaCheck {
  const [y, m] = partes(periodo)
  const fin = iso(y, m, ultimoDiaDelMes(y, m))
  const hasta = hoy < fin ? hoy : fin
  const diarios = items.filter((i) => i.frecuencia === "diaria")
  const periodicos = items.filter((i) => i.frecuencia !== "diaria")

  let dias = 0
  let completos = 0
  if (hasta >= iso(y, m, 1)) {
    for (let f = iso(y, m, 1); f <= hasta; f = sumarDias(f, 1)) {
      if (diaSemana(f) === 0) continue
      dias += 1
      const dia = mes.get(f)
      if (dia && diarios.every((i) => dia.items[i.id])) completos += 1
    }
  }

  const hechos = new Set<string>()
  for (const dia of mes.values()) {
    for (const id of Object.keys(dia.items)) hechos.add(id)
  }

  return {
    dias,
    dias_completos: completos,
    pct: dias > 0 ? Math.round((completos / dias) * 100) : null,
    periodicos_hechos: periodicos.filter((i) => hechos.has(i.id)).length,
    periodicos_total: periodicos.length,
  }
}

/** Pantalla del operario: el check de hoy y cómo viene el mes. */
export async function getCheckSector(
  sector: number
): Promise<{ data: CheckSector } | { error: string }> {
  try {
    await requireAuth()
    const hoy = hoyLocal()
    const items = itemsDelSector(sector)
    const mes = await leerMes(sector, hoy.slice(0, 7))
    return {
      data: {
        sector,
        hoy,
        items: estadoDeItems(items, mes, hoy),
        adherencia: calcularAdherencia(items, mes, `${hoy.slice(0, 7)}-01`, hoy),
      },
    }
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

// ===================================================
// Escritura
// ===================================================

async function puedeTildar(
  profile: { id: string; role: string },
  sector: number,
  periodo: string
): Promise<boolean> {
  if (["admin", "auditor", "supervisor"].includes(profile.role)) return true
  const { data } = await createAdminClient()
    .from("s5_sector_responsables")
    .select("empleado:empleados!s5_sector_responsables_empleado_id_fkey(profile_id)")
    .eq("periodo", periodo)
    .eq("sector_numero", sector)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.empleado?.profile_id === profile.id
}

export async function marcarCheck(input: {
  sector: number
  itemId: string
  hecho: boolean
  /** YYYY-MM-DD; por defecto hoy. Se acepta hoy o ayer, nada más. */
  fecha?: string
}): Promise<{ data: CheckSector } | { error: string }> {
  try {
    const profile = await requireAuth()
    const hoy = hoyLocal()
    const fecha = input.fecha ?? hoy
    if (fecha !== hoy && fecha !== sumarDias(hoy, -1)) {
      return { error: "Solo se puede tildar el check de hoy o el de ayer." }
    }
    const items = itemsDelSector(input.sector)
    const item = items.find((i) => i.id === input.itemId)
    if (!item) return { error: "Ese ítem no está en el cronograma del sector." }

    const periodo = `${fecha.slice(0, 7)}-01`
    if (!(await puedeTildar(profile, input.sector, periodo))) {
      return { error: "Este mes el check de ese sector lo carga su responsable 5S." }
    }

    const k = clave(input.sector, fecha)
    const dia = (await leerClave<CheckDia>(k)) ?? { items: {} }
    if (input.hecho) {
      dia.items[item.id] = { por: profile.nombre, at: new Date().toISOString() }
    } else {
      delete dia.items[item.id]
    }
    const res = await escribirClave(k, dia, profile.id)
    if ("error" in res) return { error: res.error }

    revalidatePath(MI_PATH)
    revalidatePath(PANEL_PATH)

    const mes = await leerMes(input.sector, hoy.slice(0, 7))
    return {
      data: {
        sector: input.sector,
        hoy,
        items: estadoDeItems(items, mes, hoy),
        adherencia: calcularAdherencia(items, mes, `${hoy.slice(0, 7)}-01`, hoy),
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error guardando el check" }
  }
}

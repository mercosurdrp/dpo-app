"use server"

/**
 * Resumen del dimensionamiento para la reunión de Logística del último día hábil
 * del mes (DPO Planeamiento 2.3 — R2.3.4: "el distribuidor comunica este tamaño a
 * los equipos de almacén, entrega y acarreo dentro de 1 mes de la ejecución").
 *
 * Es MIRANDO HACIA ADELANTE: no interesa cómo cerró el mes que termina, sino cómo
 * se va a afrontar el que entra. Por eso todo el cuadro sale de la proyección del
 * mes siguiente al de la reunión — dotación actual contra la demanda que viene,
 * con las horas extra y los refuerzos que van a hacer falta.
 *
 * Se congela en un snapshot por reunión: el módulo proyecta siempre desde el mes
 * en curso, así que sin congelar la reunión de julio mostraría meses de octubre.
 *
 * El resumen se arma sobre `getDatosDimensionamiento()` para no duplicar el modelo:
 * una sola fuente de verdad para dotaciones, capacidades y costos.
 */

import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireRole } from "@/lib/session"
import { getDatosDimensionamiento } from "./dimensionamiento"

type Result<T> = { data: T } | { error: string }

const ROLES_EDICION: ("admin" | "admin_rrhh" | "supervisor")[] = ["admin", "admin_rrhh", "supervisor"]

type Estado = "cubre" | "extras_pico" | "faltan"

export interface ResumenAlmacenRol {
  rol: string
  unidad: string
  dotacion: number
  dotacionEfectiva: number
  capacidadDia: number      // lo que mueve el equipo por día en jornada normal
  volPromDia: number        // demanda diaria promedio del mes que viene
  volPicoDia: number        // demanda del día más cargado
  horasExtra: number        // hora-hombre extra del mes
  costoHorasExtra: number
  faltanPico: number        // personas que faltarían en el día pico
  estado: Estado
}

export interface ResumenFlotaRecurso {
  recurso: string
  dotacion: number
  picoNecesario: number     // necesarios el día más cargado
  diasRefuerzo: number      // días del mes que piden más de lo que hay
  horasExtra: number        // hora-hombre extra (solo choferes/ayudantes)
  costoHorasExtra: number
  segundaVuelta: boolean
  estado: Estado
}

export interface ResumenDimensionamiento {
  mesEntrante: string       // "2026-08" — el mes que se está comunicando
  mesReunion: string        // mes de la reunión, para detectar desfasajes
  desfasado: boolean        // true si el mes entrante no es el siguiente a la reunión
  generadoEl: string
  hlProyectados: number
  ajustePct: number         // % de escenario cargado para ese mes
  almacen: ResumenAlmacenRol[]
  flota: ResumenFlotaRecurso[]
  costoTotal: number
  costoPorHl: number
  vlc: { valorMes: number | null; mesBase: string | null; meta: number | null }
}

export interface SnapshotDimReunion {
  datos: ResumenDimensionamiento
  updatedAt: string
}

/** Mes siguiente al de la fecha dada, en formato "YYYY-MM". */
function mesSiguiente(fechaIso: string): string {
  const [a, m] = fechaIso.split("-").map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`
}

async function construirResumen(fechaReunion: string): Promise<Result<ResumenDimensionamiento>> {
  const res = await getDatosDimensionamiento()
  if ("error" in res) return { error: res.error }
  const p = res.data.proyeccion
  if (!p || p.meses.length === 0) {
    return { error: "No hay proyección de volumen: cargá el presupuesto anual en el módulo de dimensionamiento." }
  }

  // El mes a comunicar es el siguiente al de la reunión. Si no está en la
  // proyección (ya pasó a ser presente o pasado), se usa el primero disponible
  // y se marca el desfasaje para avisarlo en pantalla.
  const objetivo = mesSiguiente(fechaReunion)
  let i = p.meses.findIndex((m) => m.mes === objetivo)
  const desfasado = i < 0
  if (i < 0) i = 0
  const mm = p.meses[i]
  const mesN = Number(mm.mes.split("-")[1])
  const tar = p.costoHh.find((c) => c.mes === mesN)
  const costoHhAlmacen = tar?.almacen ?? 0
  const costoHhEntrega = tar?.entrega ?? 0

  const almacen: ResumenAlmacenRol[] = p.almacen.map((r) => {
    const hh = r.horasExtra[i] ?? 0
    const faltan = r.faltanPico[i] ?? 0
    const estado: Estado = faltan > 0 ? "faltan" : hh > 0 ? "extras_pico" : "cubre"
    return {
      rol: r.rol,
      unidad: r.unidadVol,
      dotacion: r.dotacion,
      dotacionEfectiva: r.dotacionEfectiva,
      capacidadDia: r.capDiaria,
      volPromDia: Math.round(r.volPromBase * mm.indice),
      volPicoDia: r.volPicoDia[i] ?? 0,
      horasExtra: hh,
      costoHorasExtra: Math.round(hh * costoHhAlmacen),
      faltanPico: faltan,
      estado,
    }
  })

  const flota: ResumenFlotaRecurso[] = p.flota.map((r) => {
    const dias = r.diasRefuerzo[i] ?? 0
    const sv = r.segundaVueltaMeses[i] ?? false
    // Los camiones son un activo, no hora-hombre: no generan horas extra.
    const hh = r.rol === "Camiones" ? 0 : Math.round((r.personaDias?.[i] ?? 0) * p.horasVueltaExtra * 10) / 10
    const estado: Estado = sv ? "faltan" : dias > 0 ? "extras_pico" : "cubre"
    return {
      recurso: r.rol,
      dotacion: r.dotacion,
      picoNecesario: r.picoNecesario[i] ?? 0,
      diasRefuerzo: dias,
      horasExtra: hh,
      costoHorasExtra: Math.round(hh * costoHhEntrega),
      segundaVuelta: sv,
      estado,
    }
  })

  const costoTotal =
    almacen.reduce((s, r) => s + r.costoHorasExtra, 0) + flota.reduce((s, r) => s + r.costoHorasExtra, 0)

  return {
    data: {
      mesEntrante: mm.mes,
      mesReunion: fechaReunion.slice(0, 7),
      desfasado,
      generadoEl: new Date().toISOString(),
      hlProyectados: Math.round(mm.hl),
      ajustePct: mm.ajustePct,
      almacen,
      flota,
      costoTotal,
      costoPorHl: mm.hl > 0 ? Math.round((costoTotal / mm.hl) * 10) / 10 : 0,
      vlc: { valorMes: p.vlc.valorMes, mesBase: p.vlc.mesBase, meta: p.vlc.meta },
    },
  }
}

/** Devuelve el snapshot guardado para la reunión; null si todavía no se generó. */
export async function getResumenDimReunion(reunionId: string): Promise<Result<SnapshotDimReunion | null>> {
  try {
    const profile = await requireAuth()
    if (!profile) return { error: "No autenticado" }
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("reunion_dimensionamiento_snapshots")
      .select("datos, updated_at")
      .eq("reunion_id", reunionId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { data: null }
    return { data: { datos: data.datos as ResumenDimensionamiento, updatedAt: data.updated_at as string } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

/** Recalcula el resumen del mes entrante y lo congela en la reunión. */
export async function actualizarResumenDimReunion(
  reunionId: string,
  fechaReunion: string,
): Promise<Result<SnapshotDimReunion>> {
  try {
    const profile = await requireRole(ROLES_EDICION)
    if (!profile) return { error: "Sin permisos" }
    const res = await construirResumen(fechaReunion)
    if ("error" in res) return { error: res.error }
    const supabase = await createClient()
    const now = new Date().toISOString()
    const { error } = await supabase
      .from("reunion_dimensionamiento_snapshots")
      .upsert({ reunion_id: reunionId, datos: res.data, created_by: profile.id, updated_at: now }, { onConflict: "reunion_id" })
    if (error) return { error: error.message }
    return { data: { datos: res.data, updatedAt: now } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error" }
  }
}

"use server"
/**
 * Curva de ventas (SCI) en la Reunión Ventas-Logística.
 *
 * KPI 2 del TOR; Planeamiento 4.3 R4.3.3 ("revisa el índice de la curva de
 * ventas / paradas mensualmente", las tendencias alimentan el plan territorial);
 * Entrega 3.1 KPI 7. La sección muestra el mes cerrado (por defecto el anterior
 * a la fecha de la reunión): SCI vs mismo mes del año anterior, SCI de PDVs,
 * días que se salieron de la banda (promedio + 1 desvío) con su CAUSA, reparto
 * por día de semana contra el año anterior y los criterios DPO. La causa de cada
 * día pico se guarda en `sci_causas_dia` (clave = fecha, la reunión queda como
 * referencia). Los compromisos van al Action Log de la sección (seccion = 'sci').
 *
 * Los números NO se congelan: el SCI de un mes cerrado sale de ventas_diarias,
 * que no cambia una vez cerrado el mes.
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { armarCurvaMes, type DiaCurva, type EvaluacionDpo, type SciMes } from "@/lib/sci"
import { cargarSciData, hoyArg } from "@/lib/sci-cargar"

type Result<T> = { data: T } | { error: string }

const EDITOR_ROLES = ["admin", "supervisor", "admin_rrhh"]
const MIGRACION = "20261019120000_sci_causas_dia.sql"

export interface SciDiaPico {
  fecha: string
  diaSemana: number     // 1 = lunes … 6 = sábado
  hl: number
  ratio: number         // hl ÷ promedio del mes
  feriado: string | null
  causa: string | null
}

export interface SciReunionData {
  anio: number
  mes: number
  parcial: boolean
  mesActual: SciMes
  mesAA: SciMes | null
  /** Días por encima de promedio + 1 desvío, de mayor a menor HL. */
  picos: SciDiaPico[]
  /** Día más bajo del mes (valle), para la conversación de lunes vacíos. */
  valle: { fecha: string; diaSemana: number; hl: number; ratio: number } | null
  /** % del HL del mes por día de semana (lun..sáb) del mes y del mismo mes del año anterior. */
  pctDiaSemana: number[]
  pctDiaSemanaAA: number[] | null
  evaluacion: EvaluacionDpo
  /** Antes de esta fecha el HL es facturación (no había planillas de carga). */
  distribucionDesde: string | null
  /** false si la tabla sci_causas_dia todavía no existe (migración sin aplicar). */
  causasDisponibles: boolean
}

function mesCerradoAnterior(fechaReunion: string): { anio: number; mes: number } {
  const [y, m] = fechaReunion.slice(0, 7).split("-").map(Number)
  if (!y || !m) return hoyArg()
  return m === 1 ? { anio: y - 1, mes: 12 } : { anio: y, mes: m - 1 }
}

export async function getSciReunionData(params: {
  fechaReunion: string
  anio?: number
  mes?: number
}): Promise<Result<SciReunionData>> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const hoy = hoyArg()
    const def = mesCerradoAnterior(params.fechaReunion)
    const anio = params.anio && params.anio >= 2024 ? params.anio : def.anio
    const mes = params.mes && params.mes >= 1 && params.mes <= 12 ? params.mes : def.mes

    const res = await cargarSciData(supabase, anio, hoy)
    if ("error" in res) return res
    const d = res.data
    const key = `${anio}-${String(mes).padStart(2, "0")}`
    const mesActual = d.meses.find((m) => m.key === key)
    if (!mesActual) return { error: "Mes fuera de rango" }
    const mesAA = d.meses.find((m) => m.anio === anio - 1 && m.mes === mes) ?? null

    const curva: DiaCurva[] = armarCurvaMes(d.dias, anio, mes)
    const validos = curva.filter((c) => c.valido)
    const umbral = mesActual.promedio + mesActual.desvio

    // Causas cargadas para los días del mes (si la tabla existe).
    let causasDisponibles = true
    const causas = new Map<string, string>()
    const { data: cs, error: cErr } = await supabase
      .from("sci_causas_dia")
      .select("fecha, causa")
      .gte("fecha", `${key}-01`)
      .lte("fecha", `${key}-31`)
    if (cErr) {
      causasDisponibles = false
    } else {
      for (const c of cs ?? []) causas.set(String(c.fecha).slice(0, 10), String(c.causa))
    }

    const picos: SciDiaPico[] = validos
      .filter((c) => mesActual.promedio > 0 && c.hl > umbral)
      .sort((a, b) => b.hl - a.hl)
      .map((c) => ({
        fecha: c.fecha,
        diaSemana: c.diaSemana,
        hl: Math.round(c.hl * 10) / 10,
        ratio: Math.round((c.hl / mesActual.promedio) * 100) / 100,
        feriado: c.feriado,
        causa: causas.get(c.fecha) ?? null,
      }))

    const min = validos.reduce<DiaCurva | null>((p, c) => (!p || c.hl < p.hl ? c : p), null)
    const valle =
      min && mesActual.promedio > 0
        ? {
            fecha: min.fecha,
            diaSemana: min.diaSemana,
            hl: Math.round(min.hl * 10) / 10,
            ratio: Math.round((min.hl / mesActual.promedio) * 100) / 100,
          }
        : null

    return {
      data: {
        anio,
        mes,
        parcial: mesActual.parcial,
        mesActual,
        mesAA,
        picos,
        valle,
        pctDiaSemana: mesActual.pctDiaSemana,
        pctDiaSemanaAA: mesAA && mesAA.dias ? mesAA.pctDiaSemana : null,
        evaluacion: d.evaluacion,
        distribucionDesde: d.distribucionDesde,
        causasDisponibles,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error al cargar la curva de ventas" }
  }
}

/** Guarda (o borra, si viene vacía) la causa de un día pico. Sólo editores de reuniones. */
export async function guardarCausaSci(params: {
  reunionId: string
  fecha: string
  causa: string
}): Promise<Result<{ fecha: string; causa: string | null }>> {
  try {
    const profile = await requireAuth()
    if (!EDITOR_ROLES.includes(profile.role)) {
      return { error: "Solo editores pueden cargar la causa de un día pico" }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fecha)) return { error: "Fecha inválida" }
    const causa = params.causa.trim().slice(0, 500)
    const supabase = await createClient()

    if (!causa) {
      const { error } = await supabase.from("sci_causas_dia").delete().eq("fecha", params.fecha)
      if (error) return { error: traducirError(error.message) }
      return { data: { fecha: params.fecha, causa: null } }
    }

    const { error } = await supabase.from("sci_causas_dia").upsert(
      {
        fecha: params.fecha,
        causa,
        reunion_id: params.reunionId,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "fecha" },
    )
    if (error) return { error: traducirError(error.message) }
    return { data: { fecha: params.fecha, causa } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la causa" }
  }
}

function traducirError(msg: string): string {
  if (/sci_causas_dia/.test(msg) && /does not exist|schema cache/i.test(msg)) {
    return `Falta aplicar la migración ${MIGRACION} en Supabase (tabla sci_causas_dia).`
  }
  return msg
}

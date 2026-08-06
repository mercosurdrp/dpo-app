"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  CICLO_CIL_MENSUAL,
  META_CIL_MENSUAL,
  TIPOS_CIL_OBLIGATORIOS,
  TIPOS_CIL_OPTATIVOS,
} from "@/lib/flota/cil-tareas"

/**
 * Cobertura mensual del CIL (DPO Flota 4.1): qué unidad completó su ciclo y
 * cuál falta.
 *
 * 🚨 Es OTRA lectura de los mismos datos que el KPI `cil_tareas`, no un
 * reemplazo. El KPI cuenta ACTIVIDAD —cuántas tareas se hicieron contra la meta
 * de 30— y no distingue si son 30 tareas de una sola unidad. Esto cuenta
 * COBERTURA: cuántas unidades completaron las tres letras del CIL. En agosto de
 * 2026 las mismas 18 filas daban 18/30 de actividad (60 %) y 6/13 de cobertura
 * (46 %). El auditor del ATO mira la segunda.
 *
 * No hay proceso mensual que ejecutar: siempre se calcula sobre el mes pedido y
 * el 1° arranca vacío solo.
 */

export interface TareaHecha {
  fecha: string
  operario: string
  foto_url: string | null
}

export interface UnidadCobertura {
  dominio: string
  tipo: string | null
  /** Número de flota: es como el chofer llama a su unidad. */
  numero: string | null
  /** Si entra en el porcentaje o sólo se muestra (camionetas). */
  obligatoria: boolean
  /** Por tarea del ciclo, el registro más reciente del mes. */
  hechas: Record<string, TareaHecha | undefined>
  faltan: string[]
  completa: boolean
}

export interface CoberturaCilMes {
  /** Mes calculado, `YYYY-MM`. */
  ym: string
  unidades: UnidadCobertura[]
  totalObligatorias: number
  completasObligatorias: number
  /** Total de tareas del mes: el mismo número que muestra el KPI. */
  tareasMes: number
  metaMes: number
}

function ymActual(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7)
}

/** Primer día del mes siguiente, para acotar el rango sin depender de los 31. */
function inicioMesSiguiente(ym: string): string {
  const [a, m] = ym.split("-").map(Number)
  return m === 12
    ? `${a + 1}-01-01`
    : `${a}-${String(m + 1).padStart(2, "0")}-01`
}

export async function getCoberturaCilMes(
  ym?: string,
): Promise<{ data: CoberturaCilMes } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()
    const mes = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : ymActual()

    const [vehRes, cilRes] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo")
        .eq("active", true)
        .order("dominio"),
      supabase
        .from("mantenimiento_cil")
        .select("fecha, dominio, tarea, operario, foto_url")
        .gte("fecha", `${mes}-01`)
        .lt("fecha", inicioMesSiguiente(mes))
        .order("fecha", { ascending: false }),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if (cilRes.error) return { error: cilRes.error.message }

    const tareas = (cilRes.data || []) as Array<{
      fecha: string
      dominio: string
      tarea: string
      operario: string
      foto_url: string | null
    }>

    // El número de flota vive en la ficha, no en el catálogo.
    const dominios = (vehRes.data || []).map((v) => v.dominio)
    const { data: fichas } = await supabase
      .from("vehiculos_ficha")
      .select("dominio, numero_asignado")
      .in("dominio", dominios)
    const numeros = new Map(
      (fichas || []).map((f: { dominio: string; numero_asignado: string | null }) => [
        f.dominio,
        f.numero_asignado,
      ]),
    )

    const obligatorios = TIPOS_CIL_OBLIGATORIOS as readonly string[]
    const optativos = TIPOS_CIL_OPTATIVOS as readonly string[]
    const ciclo = CICLO_CIL_MENSUAL as readonly string[]

    const unidades: UnidadCobertura[] = (vehRes.data || [])
      .filter((v: { tipo: string | null }) => {
        const t = v.tipo ?? ""
        return obligatorios.includes(t) || optativos.includes(t)
      })
      .map((v: { dominio: string; tipo: string | null }) => {
        const propias = tareas.filter((t) => t.dominio === v.dominio)
        const hechas: Record<string, TareaHecha | undefined> = {}
        for (const tarea of ciclo) {
          // Las tareas vienen ordenadas por fecha desc: la primera es la última hecha.
          const hit = propias.find((p) => p.tarea === tarea)
          hechas[tarea] = hit
            ? { fecha: hit.fecha, operario: hit.operario, foto_url: hit.foto_url }
            : undefined
        }
        const faltan = ciclo.filter((t) => !hechas[t])
        return {
          dominio: v.dominio,
          tipo: v.tipo,
          numero: numeros.get(v.dominio) ?? null,
          obligatoria: obligatorios.includes(v.tipo ?? ""),
          hechas,
          faltan,
          completa: faltan.length === 0,
        }
      })

    const oblig = unidades.filter((u) => u.obligatoria)

    return {
      data: {
        ym: mes,
        unidades,
        totalObligatorias: oblig.length,
        completasObligatorias: oblig.filter((u) => u.completa).length,
        tareasMes: tareas.length,
        metaMes: META_CIL_MENSUAL,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

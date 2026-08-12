"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import {
  CICLO_CIL_MENSUAL,
  DOMINIOS_CIL_EXCLUIDOS,
  META_CIL_MENSUAL,
  TIPOS_CIL_OBLIGATORIOS,
  tareaDelCiclo,
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
  /** Si entra en el porcentaje o sólo se muestra (unidades excluidas). */
  obligatoria: boolean
  /** Por qué no cuenta, cuando no cuenta. */
  motivoExclusion: string | null
  /** Por tarea del ciclo, el registro más reciente del mes. */
  hechas: Record<string, TareaHecha | undefined>
  faltan: string[]
  completa: boolean
}

/** Cuántas unidades cerraron cada letra del ciclo: dice cuál es la que traba. */
export interface AvanceLetra {
  tarea: string
  hechas: number
  total: number
}

/**
 * Cómo viene el mes EN CURSO contra la meta de tareas.
 *
 * 🚨 `esperadoHoy` es un reparto parejo de la meta a lo largo del mes
 * (30 tareas ÷ días del mes × días transcurridos). No es un plan real —nadie
 * dijo que haya que hacer una tarea por día—, sirve para saber si al día 11 se
 * va en ritmo o hay que apurar. Por eso se muestra sólo en el mes en curso: en
 * un mes cerrado el único número que importa es el final.
 */
export interface RitmoMes {
  diaDelMes: number
  diasDelMes: number
  esperadoHoy: number
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
  /** Avance de cada letra del ciclo sobre las unidades obligatorias. */
  porLetra: AvanceLetra[]
  /** Sólo si el mes pedido es el que está corriendo. */
  ritmo: RitmoMes | null
}

/** Hoy en hora argentina, `YYYY-MM-DD`: el servidor puede estar en UTC. */
function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function ymActual(): string {
  return hoyArgentina().slice(0, 7)
}

/** Primer día del mes siguiente, para acotar el rango sin depender de los 31. */
function inicioMesSiguiente(ym: string): string {
  const [a, m] = ym.split("-").map(Number)
  return m === 12
    ? `${a + 1}-01-01`
    : `${a}-${String(m + 1).padStart(2, "0")}-01`
}

/** Último día que se le puede exigir CIL al mes: hoy si está en curso. */
function ultimoDiaExigible(ym: string): string {
  const hoy = hoyArgentina()
  const finDeMes = new Date(
    Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10)
  return hoy < finDeMes ? hoy : finDeMes
}

interface Parada {
  dominio: string
  desde: string
  hasta: string | null
}

/**
 * Trae las paradas de la flota desde las DOS fuentes en las que se registran:
 * la indisponibilidad cargada a mano y el fuera de servicio de las órdenes de
 * trabajo. Son dos tablas distintas y mirar una sola deja afuera la mitad de los
 * casos — ver `actions/checklist-adherencia.ts`, donde pasó lo mismo.
 */
async function traerParadas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  desde: string,
  hasta: string,
): Promise<Parada[]> {
  const [indispRes, otRes] = await Promise.all([
    supabase
      .from("flota_indisponibilidad")
      .select("dominio, fecha_desde, fecha_hasta")
      .gte("fecha_hasta", desde)
      .lte("fecha_desde", hasta),
    supabase
      .from("mantenimiento_realizados")
      .select("dominio, fuera_servicio_desde, fuera_servicio_hasta")
      .not("fuera_servicio_desde", "is", null)
      .lte("fuera_servicio_desde", hasta),
  ])

  const norm = (d: string | null) => (d || "").trim().toUpperCase()
  return [
    ...((indispRes.data || []) as Array<{
      dominio: string
      fecha_desde: string
      fecha_hasta: string
    }>).map((i) => ({
      dominio: norm(i.dominio),
      desde: i.fecha_desde,
      hasta: i.fecha_hasta,
    })),
    ...((otRes.data || []) as Array<{
      dominio: string
      fuera_servicio_desde: string | null
      fuera_servicio_hasta: string | null
    }>)
      .filter((o) => o.fuera_servicio_desde)
      .map((o) => ({
        dominio: norm(o.dominio),
        desde: o.fuera_servicio_desde as string,
        // OT abierta = sigue parada.
        hasta: o.fuera_servicio_hasta,
      })),
  ]
}

/**
 * ¿La unidad estuvo fuera de servicio TODOS los días exigibles del mes?
 *
 * 🚨 El corte es "todo el mes", no "algún día": el CIL es mensual, así que una
 * unidad que estuvo tres días en el taller tuvo las otras tres semanas para que
 * le hicieran la limpieza, la inspección y la lubricación — sacarla del
 * denominador por eso sería regalar cobertura. La que no tuvo NINGÚN día
 * disponible es otra cosa: exigirle el ciclo es pedir algo imposible, y arrastra
 * el porcentaje sin que nadie haya dejado de hacer nada.
 */
function paradaTodoElMes(
  dominio: string,
  ym: string,
  paradas: Parada[],
): Parada | null {
  const primero = `${ym}-01`
  const ultimo = ultimoDiaExigible(ym)
  if (ultimo < primero) return null // el mes todavía no empezó
  return (
    paradas.find(
      (p) =>
        p.dominio === dominio &&
        p.desde <= primero &&
        (p.hasta === null || p.hasta >= ultimo),
    ) ?? null
  )
}

/** "3/7 al 12/8" para explicar en pantalla por qué la unidad no cuenta. */
function motivoParada(p: Parada): string {
  const d = (f: string) => f.slice(0, 10).split("-").reverse().slice(0, 2).join("/")
  return p.hasta === null
    ? `fuera de servicio desde el ${d(p.desde)} (sigue en el taller)`
    : `fuera de servicio del ${d(p.desde)} al ${d(p.hasta)}`
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
    const ciclo = CICLO_CIL_MENSUAL as readonly string[]

    // 🚨 La unidad que estuvo TODO el mes fuera de servicio no entra en el
    // porcentaje: no se le puede hacer el CIL a un camión que está en el taller.
    // El AF469UR está parado desde el 03/07/2026 por la OT 1733 (falla de ECU) y
    // arrastraba la cobertura de agosto a 40 % cuando sin él era 43 %.
    const paradas = await traerParadas(supabase, `${mes}-01`, ultimoDiaExigible(mes))

    const unidades: UnidadCobertura[] = (vehRes.data || [])
      .filter((v: { tipo: string | null }) => obligatorios.includes(v.tipo ?? ""))
      .map((v: { dominio: string; tipo: string | null }) => {
        const propias = tareas.filter((t) => t.dominio === v.dominio)
        const hechas: Record<string, TareaHecha | undefined> = {}
        for (const tarea of ciclo) {
          // Las tareas vienen ordenadas por fecha desc: la primera es la última hecha.
          // 🚨 Se compara con `tareaDelCiclo`, no con el id crudo: las filas viejas
          // guardadas como `limpieza` cierran la misma letra que `limpieza_profunda`.
          const hit = propias.find((p) => tareaDelCiclo(p.tarea) === tarea)
          hechas[tarea] = hit
            ? { fecha: hit.fecha, operario: hit.operario, foto_url: hit.foto_url }
            : undefined
        }
        const faltan = ciclo.filter((t) => !hechas[t])
        // La lista fija primero (unidades que nunca ruedan), y si no, la parada
        // del mes. Se muestran igual en pantalla, con el motivo a la vista: que
        // no cuenten no significa esconderlas del auditor.
        const parada = paradaTodoElMes(v.dominio, mes, paradas)
        const motivoExclusion =
          DOMINIOS_CIL_EXCLUIDOS[v.dominio] ?? (parada ? motivoParada(parada) : null)
        return {
          dominio: v.dominio,
          tipo: v.tipo,
          numero: numeros.get(v.dominio) ?? null,
          obligatoria: motivoExclusion === null,
          motivoExclusion,
          hechas,
          faltan,
          completa: faltan.length === 0,
        }
      })

    const oblig = unidades.filter((u) => u.obligatoria)

    // Cuál de las tres letras es la que arrastra. Se cuenta sobre las unidades
    // obligatorias, igual que la cobertura, para que los dos números se lean
    // contra el mismo denominador.
    const porLetra: AvanceLetra[] = ciclo.map((t) => ({
      tarea: t,
      hechas: oblig.filter((u) => u.hechas[t]).length,
      total: oblig.length,
    }))

    // El ritmo sólo tiene sentido mientras el mes corre.
    const hoy = hoyArgentina()
    let ritmo: RitmoMes | null = null
    if (mes === hoy.slice(0, 7)) {
      const diaDelMes = Number(hoy.slice(8, 10))
      const [a, m] = mes.split("-").map(Number)
      const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
      ritmo = {
        diaDelMes,
        diasDelMes,
        esperadoHoy: Math.round((META_CIL_MENSUAL * diaDelMes) / diasDelMes),
      }
    }

    return {
      data: {
        ym: mes,
        unidades,
        totalObligatorias: oblig.length,
        completasObligatorias: oblig.filter((u) => u.completa).length,
        tareasMes: tareas.length,
        metaMes: META_CIL_MENSUAL,
        porLetra,
        ritmo,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

export interface PuntoSerieCil {
  ym: string
  /** Unidades que cerraron las tres letras. */
  completas: number
  /** Unidades obligatorias del mes. */
  total: number
  /** Cobertura del mes, 0–100. */
  pct: number
  /** Tareas cargadas en el mes: el KPI de actividad, contra la meta de 30. */
  tareas: number
}

/** Los últimos `meses` cerrados más el que está en curso, del más viejo al actual. */
function ventanaMeses(hasta: string, meses: number): string[] {
  const [a, m] = hasta.split("-").map(Number)
  const out: string[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    )
  }
  return out
}

/**
 * Serie mensual de la cobertura del CIL — la tendencia que el DPO pide y que la
 * pantalla, que muestra un mes por vez, no dejaba ver.
 *
 * 🚨 No hace falta ningún snapshot ni cron: `mantenimiento_cil` guarda la fecha
 * de cada tarea, así que cualquier mes se recalcula entero cuando se lo pide. Es
 * lo contrario de los KPI foto de `flota_kpi_snapshots`, que si el cron no corrió
 * ese día pierden el punto para siempre.
 *
 * 🚨 El denominador es el padrón de vehículos de HOY, no el de cada mes: no hay
 * histórico de altas y bajas del catálogo. Con la flota estable no cambia nada,
 * pero si mañana entran o salen unidades, los meses viejos se recalculan contra
 * el padrón nuevo. Vale para leer la tendencia, no para discutir un número mes
 * por mes con el auditor.
 */
export async function getSerieCoberturaCil(
  meses = 6,
): Promise<{ data: PuntoSerieCil[] } | { error: string }> {
  try {
    await requireAuth()
    const supabase = await createClient()

    const ventana = ventanaMeses(ymActual(), meses)
    const desde = `${ventana[0]}-01`
    const hasta = inicioMesSiguiente(ventana[ventana.length - 1])

    const [vehRes, cilRes] = await Promise.all([
      supabase
        .from("catalogo_vehiculos")
        .select("dominio, tipo")
        .eq("active", true),
      supabase
        .from("mantenimiento_cil")
        .select("fecha, dominio, tarea")
        .gte("fecha", desde)
        .lt("fecha", hasta),
    ])

    if (vehRes.error) return { error: vehRes.error.message }
    if (cilRes.error) return { error: cilRes.error.message }

    const obligatorios = TIPOS_CIL_OBLIGATORIOS as readonly string[]
    const ciclo = CICLO_CIL_MENSUAL as readonly string[]
    const unidades = (vehRes.data || [])
      .filter((v: { tipo: string | null }) => obligatorios.includes(v.tipo ?? ""))
      .map((v: { dominio: string }) => v.dominio)
      .filter((d: string) => !(d in DOMINIOS_CIL_EXCLUIDOS))

    // Mismo criterio que el mes: la unidad parada TODO un mes no cuenta ese mes.
    // Se trae una vez para toda la ventana y se evalúa mes por mes, porque el
    // denominador cambia según qué unidad estuvo en el taller en cada uno.
    const paradas = await traerParadas(supabase, desde, ultimoDiaExigible(ventana[ventana.length - 1]))

    const tareas = (cilRes.data || []) as Array<{
      fecha: string
      dominio: string
      tarea: string
    }>

    // (mes, dominio) → letras del ciclo ya cerradas.
    const hechas = new Map<string, Set<string>>()
    const porMes = new Map<string, number>()
    for (const t of tareas) {
      const ym = t.fecha.slice(0, 7)
      porMes.set(ym, (porMes.get(ym) ?? 0) + 1)
      const letra = tareaDelCiclo(t.tarea)
      if (!ciclo.includes(letra)) continue
      const k = `${ym}|${t.dominio}`
      if (!hechas.has(k)) hechas.set(k, new Set())
      hechas.get(k)!.add(letra)
    }

    const data: PuntoSerieCil[] = ventana.map((ym) => {
      const delMes = unidades.filter((d) => !paradaTodoElMes(d, ym, paradas))
      const completas = delMes.filter(
        (d) => (hechas.get(`${ym}|${d}`)?.size ?? 0) === ciclo.length,
      ).length
      return {
        ym,
        completas,
        total: delMes.length,
        pct: delMes.length ? Math.round((completas / delMes.length) * 100) : 0,
        tareas: porMes.get(ym) ?? 0,
      }
    })

    return { data }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error desconocido" }
  }
}

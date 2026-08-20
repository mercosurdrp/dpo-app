"use server"

/**
 * Indicador "Desvío s/ tiempo planificado" — página /indicadores/desvio-plan.
 *
 * Compara, POR RUTA de Foxtrot, el tiempo real (tiempo_ruta_minutos: inicio →
 * fin de ruta) contra la duración total planificada por el ruteador
 * (`raw_data.fx_planned_journey_sec`, columna "Planned Foxtrot Journey Seconds"
 * del CSV ROUTE_ANALYTICS: manejo + atención en PDV). Plan y real viven en la
 * misma fila, así que no hace falta ningún join por patente para el desvío; la
 * patente se cruza solo para MOSTRAR (egreso TML, igual que el drill de la
 * matinal). Mismo criterio que la serie del tablero (auto_fx_desvio_plan):
 * solo rutas finalizadas LIMPIAS (cerradas el mismo día) con plan > 0.
 *
 * Solo Pampeana (los objetivos de Misiones viven en tiempo_ruta_objetivos_zona).
 */
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/session"
import { foxtrotDcIds } from "@/lib/foxtrot"
import { esRutaLimpia } from "@/lib/foxtrot/ruta-limpia"
import {
  patentesPorChoferFecha,
  normChofer,
} from "@/lib/foxtrot/patente-pampeana"
import { IS_MISIONES } from "@/lib/empresa"
import type {
  DesvioPlanKpis,
  DesvioPlanDia,
  DesvioPlanSemana,
  DesvioPlanChofer,
  DesvioPlanRuta,
} from "@/lib/foxtrot/desvio-plan-types"

type Result<T> = { data: T } | { error: string }

const RANGO_DIAS = 90
const PEORES_RUTAS_DIAS = 30
const PEORES_RUTAS_MAX = 15
// Defaults si todavía no se configuraron umbrales en el diálogo de la matinal
// (sugeridos con agosto-2026 real: mediana +13%, p80 +33%).
const META_DEFAULT = 10
const GATILLO_DEFAULT = 30

const PAGE = 1000
const round1 = (n: number) => Math.round(n * 10) / 10

function hoyAR(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/** Número de semana ISO para etiquetar la serie semanal ("S33"). */
function semanaIso(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00.000Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const n = Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7)
  return `S${n}`
}

type Row = {
  fecha: string
  driver_name: string | null
  is_finalized: boolean | null
  tiempo_ruta_minutos: number | null
  // 🚨 raw_data proyectado, NUNCA entero: ~100 KB por ruta (waypoints) y la
  // query de 90 días muere por statement timeout (ver lib/foxtrot/ruta-limpia).
  plan: string | null
  ini: string | null
  fin: string | null
  nombre: string | null
}

export async function getDesvioPlanKpis(): Promise<Result<DesvioPlanKpis>> {
  try {
    await requireAuth()
    if (IS_MISIONES) {
      return { error: "Solo disponible en Pampeana" }
    }
    const supabase = await createClient()
    const hoy = hoyAR()
    const desde = restarDias(hoy, RANGO_DIAS)

    const rows: Row[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("foxtrot_routes")
        .select(
          "fecha, driver_name, is_finalized, tiempo_ruta_minutos, " +
            "plan:raw_data->>fx_planned_journey_sec, " +
            "ini:raw_data->>started_timestamp, fin:raw_data->>finalized_timestamp, " +
            "nombre:raw_data->>name",
        )
        .in("dc_id", foxtrotDcIds())
        .gte("fecha", desde)
        .lte("fecha", hoy)
        .order("fecha")
        .range(from, from + PAGE - 1)
      if (error) return { error: error.message }
      rows.push(...((data ?? []) as unknown as Row[]))
      if (!data || data.length < PAGE) break
    }

    // Umbrales: los mismos que el semáforo del tablero de la matinal.
    let meta = META_DEFAULT
    let gatillo = GATILLO_DEFAULT
    const { data: cfg } = await supabase
      .from("reuniones_indicadores_config")
      .select("nombre, meta, gatillo")
      .eq("tipo", "matinal-distribucion")
      .ilike("nombre", "desv%tiempo planificado")
      .limit(1)
    if (cfg && cfg.length > 0) {
      const c = cfg[0] as { meta: number | null; gatillo: number | null }
      if (c.meta != null) meta = c.meta
      if (c.gatillo != null) gatillo = c.gatillo
    }

    // Patente por chofer-fecha (solo para mostrar).
    const patenteMap = await patentesPorChoferFecha(supabase, desde, hoy)

    type Medida = {
      fecha: string
      chofer: string
      patente: string | null
      nombre_ruta: string
      plan_min: number
      real_min: number
      desvio_pct: number
    }
    const medidas: Medida[] = []
    let limpiasSinPlan = 0
    let excluidas = 0
    for (const r of rows) {
      const chofer = (r.driver_name ?? "").trim()
      if (!chofer) continue
      const real = r.tiempo_ruta_minutos
      if (r.is_finalized !== true || !real || real <= 0 || !esRutaLimpia(r.ini, r.fin)) {
        excluidas++
        continue
      }
      const planSec = Number(r.plan)
      if (!Number.isFinite(planSec) || planSec <= 0) {
        limpiasSinPlan++
        continue
      }
      const planMin = planSec / 60
      medidas.push({
        fecha: r.fecha,
        chofer,
        patente: patenteMap.get(`${r.fecha}|${normChofer(chofer)}`) ?? null,
        nombre_ruta: (r.nombre ?? "").trim() || "—",
        plan_min: planMin,
        real_min: real,
        desvio_pct: round1((100 * (real - planMin)) / planMin),
      })
    }

    // Serie diaria (ponderada por ruta, igual al tablero).
    const porDia = new Map<string, { plan: number; real: number; n: number }>()
    for (const m of medidas) {
      const a = porDia.get(m.fecha) ?? { plan: 0, real: 0, n: 0 }
      a.plan += m.plan_min
      a.real += m.real_min
      a.n++
      porDia.set(m.fecha, a)
    }
    const serieDiaria: DesvioPlanDia[] = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, a]) => ({
        fecha,
        desvio_pct: round1((100 * (a.real - a.plan)) / a.plan),
        rutas: a.n,
        plan_min: Math.round(a.plan),
        real_min: Math.round(a.real),
      }))

    // Serie semanal.
    const porSemana = new Map<string, { plan: number; real: number; n: number }>()
    for (const m of medidas) {
      const k = semanaIso(m.fecha)
      const a = porSemana.get(k) ?? { plan: 0, real: 0, n: 0 }
      a.plan += m.plan_min
      a.real += m.real_min
      a.n++
      porSemana.set(k, a)
    }
    // El Map conserva el orden de inserción y las medidas vienen por fecha.
    const serieSemanal: DesvioPlanSemana[] = [...porSemana.entries()].map(
      ([semana, a]) => ({
        semana,
        desvio_pct: round1((100 * (a.real - a.plan)) / a.plan),
        rutas: a.n,
      }),
    )

    // KPIs mes en curso vs anterior.
    const mesActual = hoy.slice(0, 7)
    const mesAnterior = restarDias(`${mesActual}-01`, 1).slice(0, 7)
    const agg = (mes: string) => {
      let plan = 0
      let real = 0
      let n = 0
      for (const m of medidas) {
        if (!m.fecha.startsWith(mes)) continue
        plan += m.plan_min
        real += m.real_min
        n++
      }
      return { plan, real, n }
    }
    const actual = agg(mesActual)
    const anterior = agg(mesAnterior)

    // Por chofer, últimos 30 días (la foto operativa; 90 días diluye).
    const desdeChofer = restarDias(hoy, PEORES_RUTAS_DIAS)
    const porChofer = new Map<
      string,
      { plan: number; real: number; n: number; peor: number; patentes: Map<string, number> }
    >()
    for (const m of medidas) {
      if (m.fecha < desdeChofer) continue
      const a =
        porChofer.get(m.chofer) ??
        { plan: 0, real: 0, n: 0, peor: -Infinity, patentes: new Map<string, number>() }
      a.plan += m.plan_min
      a.real += m.real_min
      a.n++
      if (m.desvio_pct > a.peor) a.peor = m.desvio_pct
      if (m.patente) a.patentes.set(m.patente, (a.patentes.get(m.patente) ?? 0) + 1)
      porChofer.set(m.chofer, a)
    }
    const choferes: DesvioPlanChofer[] = [...porChofer.entries()]
      .map(([chofer, a]) => ({
        chofer,
        patente:
          [...a.patentes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
        rutas: a.n,
        plan_min: Math.round(a.plan),
        real_min: Math.round(a.real),
        desvio_pct: round1((100 * (a.real - a.plan)) / a.plan),
        peor_desvio_pct: a.peor === -Infinity ? 0 : a.peor,
      }))
      .sort((x, y) => y.desvio_pct - x.desvio_pct)

    const peoresRutas: DesvioPlanRuta[] = medidas
      .filter((m) => m.fecha >= desdeChofer)
      .sort((x, y) => y.desvio_pct - x.desvio_pct)
      .slice(0, PEORES_RUTAS_MAX)
      .map((m) => ({
        fecha: m.fecha,
        chofer: m.chofer,
        patente: m.patente,
        nombre_ruta: m.nombre_ruta,
        plan_min: Math.round(m.plan_min),
        real_min: Math.round(m.real_min),
        desvio_pct: m.desvio_pct,
      }))

    const limpiasTotal = medidas.length + limpiasSinPlan
    return {
      data: {
        meta_pct: meta,
        gatillo_pct: gatillo,
        desvio_mes:
          actual.plan > 0
            ? round1((100 * (actual.real - actual.plan)) / actual.plan)
            : null,
        desvio_mes_anterior:
          anterior.plan > 0
            ? round1((100 * (anterior.real - anterior.plan)) / anterior.plan)
            : null,
        min_extra_mes: Math.round(actual.real - actual.plan),
        rutas_mes: actual.n,
        pct_cobertura:
          limpiasTotal > 0 ? round1((100 * medidas.length) / limpiasTotal) : 0,
        rutas_excluidas: excluidas,
        serie_diaria: serieDiaria,
        serie_semanal: serieSemanal,
        por_chofer: choferes,
        peores_rutas: peoresRutas,
      },
    }
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error cargando el desvío planificado",
    }
  }
}

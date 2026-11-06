// Series mensuales de cada PI y su "vista" ya juzgada para el mes foco.
//
// Todo lo que la pantalla muestra —número grande, semáforo, delta, tira de
// meses, resumen de salud, contadores de los filtros— sale de `evaluarKpis`.
// Un solo cálculo: imposible que un chip cuente distinto de lo que se ve.

import { useMemo } from "react"
import type {
  FlotaKpi,
  FlotaKpiSnapshot,
  FlotaMeta,
  FlotaPlanConItems,
  PuntoSerieKpi,
} from "@/actions/flota-indicadores"
import {
  calcularDisponibilidadMes,
  flotaDeRuta,
  ruteoSetDe,
  type CalcDisponibilidadMes,
  type UnidadFlota,
} from "@/lib/vehiculos/disponibilidad-flota"
import { cumplimientoPlanDesdeEstados } from "@/lib/vehiculos/plan-cumplimiento"
import { conformidadDocumental } from "@/lib/vehiculos/documentos-conformidad"
import { puntoFlota } from "@/lib/flota/dpo-puntos"
import type {
  CostosMantenimiento,
  DiaRuteo,
  EstadoPlanVehiculo,
  FlotaIndisponibilidad,
  MantenimientoRealizado,
} from "@/types/database"
import type {
  DocumentoVencimiento,
  ServiceGeneralUnidad,
} from "@/lib/vehiculos/service-general"
import { KPIS_FOTO, TEMA_LABEL, type KpiDef, type TemaKpi } from "./kpi-defs"
import {
  coberturaDe,
  juzgarKpi,
  type EstadoKpi,
  type MotivoSinJuzgar,
} from "./estado-kpi"
import { hoyAR, pad, ultimosMeses } from "./formato"

/** Meses de historia que muestra el tablero (2 cerrados + el actual). */
export const MESES_TENDENCIA = 3

export interface PuntoSerie {
  ym: string
  valor: number | null
  parcial: boolean
  /** Denominador detrás del valor, cuando el PI lo informa. */
  n?: number | null
  /** Universo que ese denominador debería cubrir ("7 de 85"). */
  nTotal?: number | null
  /** Casos descartados por dato inválido. */
  excluidos?: number | null
}

export interface DatosSeries {
  estados: EstadoPlanVehiculo[]
  programacion: ServiceGeneralUnidad[]
  documentos: DocumentoVencimiento[]
  costos: CostosMantenimiento
  mantenimientos: MantenimientoRealizado[]
  unidades: UnidadFlota[]
  diasRuteo: DiaRuteo[]
  indisponibilidades: FlotaIndisponibilidad[]
  kpiSnapshots: FlotaKpiSnapshot[]
  extraSeries: Partial<Record<FlotaKpi, PuntoSerieKpi[]>>
  estandaresPct: number | null
  estandaresPctMandatorio: number | null
  estandaresPctExcelencia: number | null
}

/**
 * Series por KPI para los meses del tablero. Es el cálculo que antes vivía
 * dentro del componente, sin cambios de criterio: disponibilidad y utilización
 * en vivo, costos desde `porMes`, KPIs foto desde snapshots (el mes en curso en
 * vivo) y el resto desde el server.
 */
export function useSeriesKpi(d: DatosSeries) {
  const hoy = hoyAR()
  const mesActual = hoy.slice(0, 7)
  const meses = useMemo(() => ultimosMeses(`${mesActual}-01`, MESES_TENDENCIA), [mesActual])

  const {
    estados, programacion, documentos, costos, mantenimientos, unidades, diasRuteo,
    indisponibilidades, kpiSnapshots, extraSeries, estandaresPct,
    estandaresPctMandatorio, estandaresPctExcelencia,
  } = d

  // Foto en vivo de los KPIs sin histórico propio (los meses cerrados salen de
  // snapshots).
  const fotoActual = useMemo(() => {
    const plan = cumplimientoPlanDesdeEstados(estados)
    const vencidos = programacion.filter((p) => p.estado === "vencido").length
    const docsConf = conformidadDocumental(
      unidades.map((u) => u.dominio),
      documentos
    ).pct
    return {
      valores: new Map<FlotaKpi, number | null>([
        ["cumplimiento_plan", plan.pct],
        ["services_vencidos", vencidos],
        ["docs_conformidad", docsConf],
        ["estandares_conformidad", estandaresPct],
        ["estandares_mandatorios", estandaresPctMandatorio],
        ["estandares_excelencia", estandaresPctExcelencia],
      ]),
      // Sobre cuántas tareas del plan se calculó ese porcentaje (ver
      // `cumplimientoPlanDesdeEstados`).
      planN: { conDato: plan.conDato, total: plan.total },
    }
  }, [
    estados, programacion, documentos, unidades,
    estandaresPct, estandaresPctMandatorio, estandaresPctExcelencia,
  ])

  return useMemo(() => {
    const flota = flotaDeRuta(unidades)
    const ruteoSet = ruteoSetDe(diasRuteo)
    const porMesCosto = new Map(
      costos.porMes.map((p) => [p.mes, p.preventivo + p.correctivo + p.proactivo])
    )
    const porMesPctPrev = new Map(
      costos.porMes.map((p) => {
        const total = p.preventivo + p.correctivo + p.proactivo
        return [p.mes, total > 0 ? ((p.preventivo + p.proactivo) / total) * 100 : null]
      })
    )

    const series = new Map<FlotaKpi, PuntoSerie[]>()
    const calcDisp = new Map<string, CalcDisponibilidadMes>()
    const disp: PuntoSerie[] = []
    const util: PuntoSerie[] = []
    for (const ym of meses) {
      const c = calcularDisponibilidadMes(
        ym, flota, mantenimientos, indisponibilidades, ruteoSet, hoy
      )
      calcDisp.set(ym, c)
      disp.push({ ym, valor: c.flotaDisp, parcial: ym === mesActual })
      util.push({ ym, valor: c.flotaUtil, parcial: ym === mesActual })
    }
    series.set("disponibilidad", disp)
    series.set("utilizacion", util)
    series.set(
      "costo_total",
      meses.map((ym) => ({ ym, valor: porMesCosto.get(ym) ?? null, parcial: ym === mesActual }))
    )
    series.set(
      "pct_preventivo",
      meses.map((ym) => ({ ym, valor: porMesPctPrev.get(ym) ?? null, parcial: ym === mesActual }))
    )

    // KPIs foto: meses cerrados desde snapshots, mes en curso en vivo.
    const snapBy = new Map(
      kpiSnapshots.map((s) => [`${s.kpi}|${s.year}-${pad(s.mes)}`, s.valor])
    )
    for (const kpi of KPIS_FOTO) {
      series.set(
        kpi,
        meses.map((ym) => {
          const esActual = ym === mesActual
          const valor = esActual
            ? (fotoActual.valores.get(kpi) ?? null)
            : (snapBy.get(`${kpi}|${ym}`) ?? null)
          const punto: PuntoSerie = {
            ym,
            valor: valor != null ? Number(valor) : null,
            parcial: esActual,
          }
          // El cumplimiento del plan viaja con su cobertura: en vivo sale del
          // estado del plan y en los meses cerrados, de los snapshots que el
          // cron viene guardando (los meses previos a esa foto quedan sin n, y
          // ahí el semáforo se comporta como antes).
          if (kpi === "cumplimiento_plan") {
            const conDato = esActual
              ? fotoActual.planN.conDato
              : snapBy.get(`plan_tareas_con_dato|${ym}`)
            const total = esActual
              ? fotoActual.planN.total
              : snapBy.get(`plan_tareas_total|${ym}`)
            punto.n = conDato != null ? Number(conDato) : null
            punto.nTotal = total != null ? Number(total) : null
          }
          return punto
        })
      )
    }

    // Adherencia al checklist (R1.3.1a): también sale de la foto, pero el mes
    // EN CURSO también. A diferencia del resto de los KPIs foto acá no hay
    // cálculo en vivo posible en el cliente: el denominador son los camión-día
    // de `ventas_diarias_cliente` (~20.000 filas por trimestre) y esta página
    // no los tiene cargados. El cron pisa el mes en curso todos los días, así
    // que el número tiene como máximo un día de atraso; el valor al minuto
    // está en la tarjeta de Adherencia de la solapa Checklists, que es
    // justamente a donde lleva el click.
    series.set(
      "checklist_adherencia",
      meses.map((ym) => {
        const valor = snapBy.get(`checklist_adherencia|${ym}`)
        return { ym, valor: valor != null ? Number(valor) : null, parcial: ym === mesActual }
      })
    )

    // PIs calculados en el server: llegan como serie {ym, valor}; el mes en
    // curso siempre es parcial.
    for (const [kpi, serie] of Object.entries(extraSeries) as Array<
      [FlotaKpi, PuntoSerieKpi[]]
    >) {
      const byYm = new Map(serie.map((p) => [p.ym, p]))
      series.set(
        kpi,
        meses.map((ym) => {
          const p = byYm.get(ym)
          return {
            ym,
            valor: p?.valor != null ? Number(p.valor) : null,
            parcial: ym === mesActual,
            n: p?.n ?? null,
            nTotal: p?.nTotal ?? null,
            excluidos: p?.excluidos ?? null,
          }
        })
      )
    }
    return { hoy, mesActual, meses, series, calcDisp }
  }, [
    hoy, meses, mesActual, unidades, diasRuteo, costos, mantenimientos,
    indisponibilidades, kpiSnapshots, fotoActual, extraSeries,
  ])
}

// ==================== Vista juzgada de cada PI ====================

export interface PuntoVista extends PuntoSerie {
  estado: EstadoKpi
  motivo: MotivoSinJuzgar | null
  cobertura: number | null
  plan: FlotaPlanConItems | null
}

export interface KpiVista {
  def: KpiDef
  meta: FlotaMeta | null
  /** Serie juzgada mes a mes (vacía en los PI sin serie). */
  serie: PuntoVista[]
  /** Mes del número grande. */
  ym: string
  /** Punto del número grande (con estado, n, plan…). */
  punto: PuntoVista
  /** Mes con el que se compara el delta. */
  ymPrevio: string | null
  delta: number | null
  mejora: boolean | null
  /**
   * Mes en curso de un acumulativo cuando el número grande es un mes cerrado:
   * se muestra aparte, neutro, como avance.
   */
  avance: PuntoVista | null
  mandatorio: boolean
  /** Algún plan de este PI sigue abierto o en progreso. */
  planAbierto: boolean
  /** El mes del número grande está fuera de meta o cerca y no tiene plan. */
  faltaPlan: boolean
}

/** "auto" = cada PI en su mes natural (ver `mesPrincipal`). */
export type MesFoco = "auto" | string

/**
 * Mes del número grande de un PI.
 *
 * Con foco "auto", los acumulativos muestran el último mes CERRADO —su mes en
 * curso no se puede juzgar y un número grande gris no le dice nada a nadie—, y
 * el resto muestra el mes en curso. Con un mes elegido, todos muestran ese mes.
 * Los PI sin serie siempre muestran la foto actual.
 */
function mesPrincipal(def: KpiDef, foco: MesFoco, meses: string[], mesActual: string) {
  if (!def.conSerie) return mesActual
  if (foco !== "auto" && meses.includes(foco)) return foco
  if (def.acumulativo) return meses[meses.length - 2] ?? mesActual
  return mesActual
}

export function evaluarKpis(a: {
  defs: KpiDef[]
  series: Map<FlotaKpi, PuntoSerie[]>
  metaBy: Map<FlotaKpi, FlotaMeta>
  planes: FlotaPlanConItems[]
  meses: string[]
  mesActual: string
  foco: MesFoco
}): KpiVista[] {
  const planBy = new Map(a.planes.map((p) => [`${p.kpi}|${p.year}-${pad(p.mes)}`, p]))
  const abiertos = new Set(a.planes.filter((p) => p.estado !== "cerrado").map((p) => p.kpi))

  return a.defs.map((def) => {
    const meta = a.metaBy.get(def.kpi) ?? null
    const cruda = a.series.get(def.kpi) ?? []
    const juzgar = (p: PuntoSerie): PuntoVista => {
      const cobertura = coberturaDe(p)
      // 🚨 `parcial` sale del punto (mes REAL en curso), nunca del foco: mirar
      // noviembre desde otro lado no lo vuelve juzgable.
      const j = juzgarKpi(p.valor, meta, {
        acumulativo: def.acumulativo,
        parcial: p.parcial,
        cobertura,
        coberturaMinima: def.coberturaMinima,
      })
      return {
        ...p,
        ...j,
        cobertura,
        plan: planBy.get(`${def.kpi}|${p.ym}`) ?? null,
      }
    }
    const serieTodos = cruda.map(juzgar)
    const ym = mesPrincipal(def, a.foco, a.meses, a.mesActual)
    const punto =
      serieTodos.find((p) => p.ym === ym) ??
      juzgar({ ym, valor: null, parcial: ym === a.mesActual })

    // Delta contra el mes anterior al del número grande.
    // 🚨 Antes comparaba los dos últimos puntos con dato, y uno era el mes en
    // curso parcial: en los acumulativos la flecha daba siempre "mejora" en los
    // de menos-es-mejor y siempre "empeora" en los de más-es-mejor.
    const idx = serieTodos.findIndex((p) => p.ym === ym)
    const previo = idx > 0 ? serieTodos[idx - 1] : null
    const comparable =
      def.conSerie &&
      previo != null &&
      previo.valor != null &&
      punto.valor != null &&
      !(def.acumulativo && punto.parcial)
    const delta = comparable ? Number(punto.valor) - Number(previo!.valor) : null
    // Mejora/empeora según el sentido de la meta (<= : bajar es mejorar).
    const mejora = delta == null ? null : meta?.comparador === "<=" ? delta <= 0 : delta >= 0

    const actual = serieTodos.find((p) => p.parcial) ?? null
    const avance = def.acumulativo && actual && actual.ym !== ym ? actual : null

    return {
      def,
      meta,
      serie: def.conSerie ? serieTodos : [],
      ym,
      punto,
      ymPrevio: comparable ? previo!.ym : null,
      delta,
      mejora,
      avance,
      mandatorio: def.dpo ? (puntoFlota(def.dpo)?.mandatorio ?? false) : false,
      planAbierto: abiertos.has(def.kpi),
      faltaPlan:
        (punto.estado === "critico" || punto.estado === "alerta") && punto.plan == null,
    }
  })
}

// ==================== Filtros ====================

export type FiltroPlan = "falta" | "abierto"

export interface FiltrosIndicadores {
  estados: EstadoKpi[]
  temas: TemaKpi[]
  soloMandatorios: boolean
  plan: FiltroPlan | null
  q: string
}

type Faceta = "estado" | "tema" | "mandatorio" | "plan" | "q"

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function pasa(v: KpiVista, f: FiltrosIndicadores, salvo?: Faceta): boolean {
  if (salvo !== "estado" && f.estados.length > 0 && !f.estados.includes(v.punto.estado))
    return false
  if (salvo !== "tema" && f.temas.length > 0 && !f.temas.includes(v.def.tema)) return false
  if (salvo !== "mandatorio" && f.soloMandatorios && !v.mandatorio) return false
  if (salvo !== "plan" && f.plan === "falta" && !v.faltaPlan) return false
  if (salvo !== "plan" && f.plan === "abierto" && !v.planAbierto) return false
  if (salvo !== "q" && f.q.trim()) {
    const texto = normalizar(
      `${v.def.label} ${v.def.descripcion} ${v.def.dpo ?? ""} ${TEMA_LABEL[v.def.tema]}`
    )
    const terminos = normalizar(f.q).split(/\s+/).filter(Boolean)
    if (!terminos.every((t) => texto.includes(t))) return false
  }
  return true
}

export const aplicarFiltros = (vs: KpiVista[], f: FiltrosIndicadores) =>
  vs.filter((v) => pasa(v, f))

export interface Facetas {
  estado: Record<EstadoKpi, number>
  motivos: Record<MotivoSinJuzgar, number>
  tema: Record<TemaKpi, number>
  mandatorios: number
  falta: number
  abierto: number
}

/** Cada contador cuenta lo que quedaría visible con TODOS los demás filtros. */
export function contarFacetas(vs: KpiVista[], f: FiltrosIndicadores): Facetas {
  const out: Facetas = {
    estado: { ok: 0, alerta: 0, critico: 0, neutro: 0 },
    motivos: { sin_dato: 0, sin_meta: 0, mes_en_curso: 0, poca_cobertura: 0 },
    tema: {} as Record<TemaKpi, number>,
    mandatorios: 0,
    falta: 0,
    abierto: 0,
  }
  for (const v of vs) {
    if (pasa(v, f, "estado")) {
      out.estado[v.punto.estado]++
      if (v.punto.motivo) out.motivos[v.punto.motivo]++
    }
    if (pasa(v, f, "tema")) out.tema[v.def.tema] = (out.tema[v.def.tema] ?? 0) + 1
    if (pasa(v, f, "mandatorio") && v.mandatorio) out.mandatorios++
    if (pasa(v, f, "plan")) {
      if (v.faltaPlan) out.falta++
      if (v.planAbierto) out.abierto++
    }
  }
  return out
}

export const filtrosActivos = (f: FiltrosIndicadores) =>
  f.estados.length + f.temas.length + (f.soloMandatorios ? 1 : 0) + (f.plan ? 1 : 0) +
  (f.q.trim() ? 1 : 0)

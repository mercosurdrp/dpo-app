"use client"

// Tablero de Indicadores de Flota.
//
// Se lee de arriba a abajo por importancia: salud del tablero y lo que
// necesita atención → lo que mira primero la auditoría (mandatorios + la
// disponibilidad que siente el cliente) → confiabilidad → gestión y mejora →
// planes de acción. Cada PI contra su meta, con su tendencia y su plan por mes
// fuera de meta (patrón TML/TI adaptado con discriminador de KPI).
//
// La lógica vive en `_components/indicadores/`:
//  - kpi-defs: qué es cada PI, su tier, tema y forma (con los 🚨 de negocio).
//  - estado-kpi: el ÚNICO juicio contra la meta.
//  - vistas: series por mes + la vista juzgada que consume toda la pantalla.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, SearchX } from "lucide-react"
import type {
  FlotaKpi,
  FlotaKpiConDetalle,
  FlotaKpiSnapshot,
  FlotaMeta,
  FlotaPlanConItems,
  PuntoSerieKpi,
} from "@/actions/flota-indicadores"
import type { UnidadFlota } from "@/lib/vehiculos/disponibilidad-flota"
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
import { DpoSeccionCinta } from "./_components/dpo-badge"
import {
  CrearPlanDialog,
  DetalleKpiDialog,
  DetallePlanDialog,
} from "./_components/indicadores/dialogs"
import { FiltrosIndicadoresBar, useFiltrosIndicadores } from "./_components/indicadores/filtros"
import { fmtMesNombre } from "./_components/indicadores/formato"
import {
  DESTINO_KPI,
  KPI_DEF_BY,
  KPI_DEFS,
  TEMAS,
  TIERS,
  type KpiDef,
} from "./_components/indicadores/kpi-defs"
import { PlanesAccion } from "./_components/indicadores/planes-accion"
import { mesesSinPlan, ResumenSalud } from "./_components/indicadores/resumen-salud"
import { KpiTarjeta, type AccionesTarjeta } from "./_components/indicadores/tarjeta"
import {
  aplicarFiltros,
  contarFacetas,
  evaluarKpis,
  filtrosActivos,
  useSeriesKpi,
  type KpiVista,
} from "./_components/indicadores/vistas"

interface Props {
  estados: EstadoPlanVehiculo[]
  programacion: ServiceGeneralUnidad[]
  documentos: DocumentoVencimiento[]
  costos: CostosMantenimiento
  mantenimientos: MantenimientoRealizado[]
  unidades: UnidadFlota[]
  diasRuteo: DiaRuteo[]
  indisponibilidades: FlotaIndisponibilidad[]
  metas: FlotaMeta[]
  planes: FlotaPlanConItems[]
  kpiSnapshots: FlotaKpiSnapshot[]
  extraSeries: Partial<Record<FlotaKpi, PuntoSerieKpi[]>>
  estandaresPct: number | null
  estandaresPctMandatorio: number | null
  estandaresPctExcelencia: number | null
  puedeEditar: boolean
  esAdmin: boolean
  /** Cambia de solapa dentro del módulo (lo provee `mantenimiento-client`). */
  onNavegar?: (tab: string) => void
}

export function IndicadoresFlota(props: Props) {
  const { metas, planes, puedeEditar, esAdmin, onNavegar } = props
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router])

  const { hoy, mesActual, meses, series, calcDisp } = useSeriesKpi(props)
  const { foco, setFoco, filtros, set, limpiar } = useFiltrosIndicadores(meses)

  const metaBy = useMemo(() => new Map(metas.map((m) => [m.kpi, m])), [metas])
  const vistas = useMemo(
    () => evaluarKpis({ defs: KPI_DEFS, series, metaBy, planes, meses, mesActual, foco }),
    [series, metaBy, planes, meses, mesActual, foco]
  )
  const visibles = useMemo(() => aplicarFiltros(vistas, filtros), [vistas, filtros])
  const facetas = useMemo(() => contarFacetas(vistas, filtros), [vistas, filtros])
  const filtrando = filtrosActivos(filtros) > 0

  // ---------- Diálogos ----------
  const [planNuevo, setPlanNuevo] = useState<{
    def: KpiDef
    ym: string
    valor: number | null
    meta: number | null
  } | null>(null)
  const [planVer, setPlanVer] = useState<FlotaPlanConItems | null>(null)
  const [detalleVer, setDetalleVer] = useState<{
    kpi: FlotaKpiConDetalle
    label: string
    ym: string
  } | null>(null)

  /**
   * Acción del botón de detalle. `undefined` cuando el PI no tiene a dónde
   * llevar: sin destino no se muestra el botón, para no prometer un detalle
   * que no existe.
   */
  const abrirDe = (v: KpiVista): (() => void) | undefined => {
    const d = DESTINO_KPI[v.def.kpi]
    if (!d) return undefined
    if (d.detalle) return () => setDetalleVer({ kpi: d.detalle!, label: v.def.label, ym: v.ym })
    if (d.href) return () => router.push(d.href!)
    if (d.tab && onNavegar) return () => onNavegar(d.tab!)
    return undefined
  }

  const crearPlan = useCallback(
    (v: KpiVista, ym: string, valor: number | null) =>
      setPlanNuevo({ def: v.def, ym, valor, meta: v.meta?.meta ?? null }),
    []
  )

  // ---------- Ir a una tarjeta desde el resumen ----------
  const [resaltado, setResaltado] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const irA = (kpi: string) => {
    // Si un filtro la esconde, se limpian los filtros: el resumen mira todo.
    if (!visibles.some((v) => v.def.kpi === kpi)) limpiar()
    requestAnimationFrame(() => {
      document.getElementById(`kpi-${kpi}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    setResaltado(kpi)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setResaltado(null), 1800)
  }
  const irPlanes = () =>
    document.getElementById("planes-accion")?.scrollIntoView({ behavior: "smooth", block: "start" })

  // ---------- Planes ----------
  const [planesTodos, setPlanesTodos] = useState(false)
  const kpisVisibles = useMemo(() => new Set(visibles.map((v) => v.def.kpi)), [visibles])
  const planesVista =
    filtrando && !planesTodos ? planes.filter((p) => kpisVisibles.has(p.kpi)) : planes
  const faltan = mesesSinPlan(filtrando && !planesTodos ? visibles : vistas)
  const comparadorDe = useCallback(
    (kpi: string) => metaBy.get(kpi as FlotaKpi)?.comparador ?? ">=",
    [metaBy]
  )

  // Acumulativos sin juzgar porque se eligió mirar el mes en curso.
  const acumEnCurso =
    foco === mesActual
      ? vistas.filter((v) => v.punto.motivo === "mes_en_curso").length
      : 0
  const mesCerrado = meses[meses.length - 2]

  const accionesDe = (v: KpiVista): AccionesTarjeta => ({
    puedeEditar,
    onMetaSaved: refresh,
    onCrearPlan: crearPlan,
    onVerPlan: setPlanVer,
    onAbrir: abrirDe(v),
  })

  const tarjeta = (v: KpiVista, heroe: boolean) => (
    <KpiTarjeta
      key={v.def.kpi}
      vista={v}
      heroe={heroe}
      hoy={hoy}
      mesActual={mesActual}
      calcDisp={v.def.kpi === "disponibilidad" ? calcDisp.get(v.ym) : undefined}
      resaltada={resaltado === v.def.kpi}
      acciones={accionesDe(v)}
    />
  )

  const soloFueraVacio =
    visibles.length === 0 &&
    filtros.estados.length > 0 &&
    filtros.estados.every((e) => e === "critico" || e === "alerta")

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="space-y-2">
        <DpoSeccionCinta seccionId="indicadores" />
        <p className="max-w-3xl text-sm text-muted-foreground">
          Cada indicador contra su meta, ordenados por lo que más pesa en la auditoría. Un mes
          fuera de meta pide un plan de acción con causa raíz y acciones con responsable.
        </p>
      </div>

      <ResumenSalud
        vistas={vistas}
        planes={planes}
        hoy={hoy}
        mesActual={mesActual}
        foco={foco}
        onIrA={irA}
        onIrPlanes={irPlanes}
      />

      <FiltrosIndicadoresBar
        meses={meses}
        mesActual={mesActual}
        foco={foco}
        setFoco={setFoco}
        filtros={filtros}
        facetas={facetas}
        set={set}
        limpiar={limpiar}
        visibles={visibles.length}
        total={vistas.length}
      />

      {acumEnCurso > 0 && mesCerrado && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-muted/70 px-4 py-3 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{acumEnCurso}</span> indicadores
            acumulativos se juzgan al cierre del mes.
          </span>
          <button
            type="button"
            onClick={() => setFoco(mesCerrado)}
            className="min-h-10 font-medium text-primary hover:underline"
          >
            Ver {fmtMesNombre(mesCerrado)} (cerrado) →
          </button>
        </p>
      )}

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          {soloFueraVacio ? (
            <>
              <CheckCircle2 className="size-8 text-emerald-500" aria-hidden />
              <p className="text-base font-medium text-foreground">
                Ningún indicador fuera de meta con estos filtros
              </p>
            </>
          ) : (
            <>
              <SearchX className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-base font-medium text-foreground">
                Ningún indicador cumple estos filtros
              </p>
            </>
          )}
          <button
            type="button"
            onClick={limpiar}
            className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/5"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        TIERS.map((t) => {
          const deTier = visibles.filter((v) => v.def.tier === t.tier)
          if (deTier.length === 0) return null
          const heroes = deTier.filter((v) => v.def.heroe)
          const resto = deTier.filter((v) => !v.def.heroe)
          return (
            <section key={t.tier} aria-labelledby={`tier-${t.tier}`} className="space-y-4 pt-2">
              <div>
                <h2
                  id={`tier-${t.tier}`}
                  className="text-xl font-semibold tracking-tight text-foreground"
                >
                  {t.titulo}
                </h2>
                <p className="text-sm text-muted-foreground">{t.sub}</p>
              </div>
              {t.tier === 1 ? (
                <>
                  {heroes.length > 0 && (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {heroes.map((v) => tarjeta(v, true))}
                    </div>
                  )}
                  {resto.length > 0 && (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {resto.map((v) => tarjeta(v, false))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-5">
                  {TEMAS.map((tema) => {
                    const deTema = resto.filter((v) => v.def.tema === tema.id)
                    if (deTema.length === 0) return null
                    return (
                      <div key={tema.id} className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">
                          {tema.label}
                        </h3>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {deTema.map((v) => tarjeta(v, false))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })
      )}

      <PlanesAccion
        planes={planesVista}
        totalPlanes={planes.length}
        filtrando={filtrando && !planesTodos && planesVista.length !== planes.length}
        onVerTodos={() => setPlanesTodos(true)}
        faltan={faltan}
        hoy={hoy}
        comparadorDe={comparadorDe}
        puedeEditar={puedeEditar}
        onVerPlan={setPlanVer}
        onCrearPlan={(f) => crearPlan(f.vista, f.ym, f.valor)}
      />

      {planNuevo && (
        <CrearPlanDialog
          def={planNuevo.def}
          ym={planNuevo.ym}
          valor={planNuevo.valor}
          meta={planNuevo.meta}
          onClose={() => setPlanNuevo(null)}
          onSaved={() => {
            setPlanNuevo(null)
            refresh()
          }}
        />
      )}
      {planVer && (
        <DetallePlanDialog
          plan={planVer}
          def={KPI_DEF_BY.get(planVer.kpi)}
          puedeEditar={puedeEditar}
          esAdmin={esAdmin}
          onClose={() => setPlanVer(null)}
          onChanged={refresh}
        />
      )}
      {detalleVer && (
        <DetalleKpiDialog
          key={`${detalleVer.kpi}|${detalleVer.ym}`}
          kpi={detalleVer.kpi}
          label={detalleVer.label}
          ym={detalleVer.ym}
          onClose={() => setDetalleVer(null)}
        />
      )}
    </div>
  )
}

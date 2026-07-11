"use client"

// Tablero de Indicadores de Flota: cada KPI con valor actual, meta editable,
// tendencia de los últimos 3 meses y plan de acción por mes fuera de meta
// (patrón TML/TI adaptado con discriminador de KPI).

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  addFlotaPlanItem,
  cerrarFlotaPlan,
  createFlotaPlan,
  deleteFlotaPlan,
  deleteFlotaPlanItem,
  updateFlotaMeta,
  updateFlotaPlanItem,
  type FlotaKpi,
  type FlotaKpiSnapshot,
  type FlotaMeta,
  type FlotaPlanConItems,
  type PuntoSerieKpi,
} from "@/actions/flota-indicadores"
import {
  calcularDisponibilidadMes,
  flotaDeRuta,
  ruteoSetDe,
  type UnidadFlota,
} from "@/lib/vehiculos/disponibilidad-flota"
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
import { conformidadDocumental } from "@/lib/vehiculos/documentos-conformidad"

const MESES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const pad = (n: number) => String(n).padStart(2, "0")
const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtMesCorto = (ym: string) => MESES_CORTO[Number(ym.slice(5, 7)) - 1] ?? ym
const fmtMesLargo = (ym: string) =>
  `${MESES_LARGO[Number(ym.slice(5, 7)) - 1] ?? ym} ${ym.slice(0, 4)}`

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(v)

// ==================== Definición de KPIs ====================

interface KpiDef {
  kpi: FlotaKpi
  label: string
  descripcion: string
  /** Formatea el valor para mostrar. */
  fmt: (v: number) => string
  /** true = con serie mensual (tendencia); false = solo foto actual. */
  conSerie: boolean
}

const KPI_DEFS: KpiDef[] = [
  {
    kpi: "disponibilidad",
    label: "Disponibilidad de flota",
    descripcion: "Días disponibles ÷ días del período (unidades de ruta)",
    fmt: (v) => `${v.toFixed(1)}%`,
    conSerie: true,
  },
  {
    kpi: "utilizacion",
    label: "Utilización de flota",
    descripcion: "Días ruteados ÷ días laborales disponibles (unidades en servicio)",
    fmt: (v) => `${v.toFixed(1)}%`,
    conSerie: true,
  },
  {
    kpi: "costo_total",
    label: "Costo de mantenimiento",
    descripcion: "Costo mensual de OT: tareas + mano de obra + repuestos",
    fmt: fmtMoney,
    conSerie: true,
  },
  {
    kpi: "pct_preventivo",
    label: "% preventivo del costo",
    descripcion: "Costo preventivo + proactivo ÷ costo total del mes",
    fmt: (v) => `${v.toFixed(0)}%`,
    conSerie: true,
  },
  {
    kpi: "cumplimiento_plan",
    label: "Cumplimiento del plan preventivo",
    descripcion:
      "Tareas del plan al día ÷ tareas con datos. Meses cerrados: última foto diaria del mes",
    fmt: (v) => `${v.toFixed(0)}%`,
    conSerie: true,
  },
  {
    kpi: "services_vencidos",
    label: "Services vencidos",
    descripcion:
      "Unidades con service general vencido. Meses cerrados: última foto diaria del mes",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
  },
  {
    kpi: "docs_conformidad",
    label: "Conformidad documental",
    descripcion:
      "Unidades activas sin documentos vencidos ÷ flota activa. Un doc vencido deja la unidad fuera de servicio hasta regularizar",
    fmt: (v) => `${v.toFixed(0)}%`,
    conSerie: true,
  },
  {
    kpi: "estandares_conformidad",
    label: "Conformidad de estándares",
    descripcion:
      "Ítems OK ÷ evaluables en la matriz de Estándares de flota (GTS). Meses cerrados: última foto diaria",
    fmt: (v) => `${v.toFixed(1)}%`,
    conSerie: true,
  },
  {
    kpi: "checklist_deteccion",
    label: "Defectos anticipados por checklist",
    descripcion:
      "OTs correctivas del mes con defecto detectado en el checklist de la unidad en los 15 días previos ÷ OTs correctivas",
    fmt: (v) => `${v.toFixed(0)}%`,
    conSerie: true,
  },
  {
    kpi: "checklist_resolucion",
    label: "Resolución de defectos de checklist",
    descripcion:
      "Días promedio entre el defecto observado y su plan de acción resuelto (por mes de resolución)",
    fmt: (v) => `${v.toFixed(1)} d`,
    conSerie: true,
  },
  {
    kpi: "inventario_exactitud",
    label: "Exactitud de inventario",
    descripcion:
      "Ítems sin diferencia en el último conteo físico del mes ÷ ítems contados (Repuestos → Conteo de stock)",
    fmt: (v) => `${v.toFixed(0)}%`,
    conSerie: true,
  },
  {
    kpi: "combustible_kml",
    label: "Rendimiento de combustible",
    descripcion:
      "Σ km recorridos ÷ Σ litros con medición del mes (mismo criterio que el módulo Combustible)",
    fmt: (v) => `${v.toFixed(2)} km/l`,
    conSerie: true,
  },
  {
    kpi: "co2_flota",
    label: "Huella de CO₂ de flota",
    descripcion:
      "Litros de gasoil cargados × 2,68 kg CO₂/l (estimación estándar; sostenibilidad DPO 4.3)",
    fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${v.toFixed(0)} kg`),
    conSerie: true,
  },
  {
    kpi: "cil_tareas",
    label: "Tareas CIL / ATO completadas",
    descripcion:
      "Limpiezas, inspecciones y lubricaciones autónomas registradas en el mes (Check lists → Tareas CIL)",
    fmt: (v) => String(Math.round(v)),
    conSerie: true,
  },
]

// KPIs cuya serie de meses cerrados sale de `flota_kpi_snapshots` (los pisa el
// cron diario); el mes en curso se calcula en vivo.
const KPIS_FOTO: FlotaKpi[] = [
  "cumplimiento_plan",
  "services_vencidos",
  "docs_conformidad",
  "estandares_conformidad",
]

interface PuntoSerie {
  ym: string
  valor: number | null
  parcial: boolean
}

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
  puedeEditar: boolean
  esAdmin: boolean
}

export function IndicadoresFlota({
  estados,
  programacion,
  documentos,
  costos,
  mantenimientos,
  unidades,
  diasRuteo,
  indisponibilidades,
  metas,
  planes,
  kpiSnapshots,
  extraSeries,
  estandaresPct,
  puedeEditar,
  esAdmin,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [planNuevo, setPlanNuevo] = useState<{
    def: KpiDef
    ym: string
    valor: number | null
    meta: number | null
  } | null>(null)
  const [planVer, setPlanVer] = useState<FlotaPlanConItems | null>(null)

  const metaBy = useMemo(() => new Map(metas.map((m) => [m.kpi, m])), [metas])
  const planBy = useMemo(
    () => new Map(planes.map((p) => [`${p.kpi}|${p.year}-${pad(p.mes)}`, p])),
    [planes]
  )

  // Últimos 3 meses: 2 cerrados + el actual (parcial).
  const meses3 = useMemo(() => {
    const hoy = hoyISO()
    const [y, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))]
    const out: string[] = []
    for (let i = 2; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1)
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
    }
    return out
  }, [])
  const mesActual = meses3[meses3.length - 1]

  // Foto en vivo de los KPIs sin histórico: cumplimiento del plan y services
  // vencidos (valor del mes en curso; los meses cerrados salen de snapshots).
  const fotoActual = useMemo(() => {
    let ok = 0
    let noOk = 0
    for (const e of estados) {
      for (const c of e.celdas) {
        if (c.estado === "ok") ok++
        else if (c.estado === "proximo" || c.estado === "vencido") noOk++
      }
    }
    const cumplimiento = ok + noOk > 0 ? (ok / (ok + noOk)) * 100 : null
    const vencidos = programacion.filter((p) => p.estado === "vencido").length
    const docsConf = conformidadDocumental(
      unidades.map((u) => u.dominio),
      documentos
    ).pct
    return new Map<FlotaKpi, number | null>([
      ["cumplimiento_plan", cumplimiento],
      ["services_vencidos", vencidos],
      ["docs_conformidad", docsConf],
      ["estandares_conformidad", estandaresPct],
    ])
  }, [estados, programacion, documentos, unidades, estandaresPct])

  // Series por KPI para los 3 meses.
  const series = useMemo(() => {
    const hoy = hoyISO()
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

    const out = new Map<FlotaKpi, PuntoSerie[]>()
    const disp: PuntoSerie[] = []
    const util: PuntoSerie[] = []
    for (const ym of meses3) {
      const c = calcularDisponibilidadMes(
        ym, flota, mantenimientos, indisponibilidades, ruteoSet, hoy
      )
      disp.push({ ym, valor: c.flotaDisp, parcial: ym === mesActual })
      util.push({ ym, valor: c.flotaUtil, parcial: ym === mesActual })
    }
    out.set("disponibilidad", disp)
    out.set("utilizacion", util)
    out.set(
      "costo_total",
      meses3.map((ym) => ({
        ym,
        valor: porMesCosto.get(ym) ?? null,
        parcial: ym === mesActual,
      }))
    )
    out.set(
      "pct_preventivo",
      meses3.map((ym) => ({
        ym,
        valor: porMesPctPrev.get(ym) ?? null,
        parcial: ym === mesActual,
      }))
    )

    // KPIs foto: meses cerrados desde snapshots, mes en curso en vivo.
    const snapBy = new Map(
      kpiSnapshots.map((s) => [`${s.kpi}|${s.year}-${pad(s.mes)}`, s.valor])
    )
    for (const kpi of KPIS_FOTO) {
      out.set(
        kpi,
        meses3.map((ym) => {
          const valor =
            ym === mesActual
              ? (fotoActual.get(kpi) ?? null)
              : (snapBy.get(`${kpi}|${ym}`) ?? null)
          return { ym, valor: valor != null ? Number(valor) : null, parcial: ym === mesActual }
        })
      )
    }

    // PIs calculados en el server (checklist, y a futuro combustible/CO2):
    // llegan como serie {ym, valor}; el mes en curso siempre es parcial.
    for (const [kpi, serie] of Object.entries(extraSeries) as Array<
      [FlotaKpi, PuntoSerieKpi[]]
    >) {
      const byYm = new Map(serie.map((p) => [p.ym, p.valor]))
      out.set(
        kpi,
        meses3.map((ym) => ({
          ym,
          valor: byYm.get(ym) != null ? Number(byYm.get(ym)) : null,
          parcial: ym === mesActual,
        }))
      )
    }
    return out
  }, [
    meses3,
    mesActual,
    unidades,
    diasRuteo,
    costos,
    mantenimientos,
    indisponibilidades,
    kpiSnapshots,
    fotoActual,
    extraSeries,
  ])

  const valorActual = (def: KpiDef): number | null =>
    series.get(def.kpi)?.find((p) => p.ym === mesActual)?.valor ?? null

  const planesOrdenados = useMemo(
    () =>
      [...planes].sort((a, b) =>
        a.estado === b.estado
          ? (b.year - a.year) * 100 + (b.mes - a.mes)
          : a.estado === "cerrado"
            ? 1
            : -1
      ),
    [planes]
  )

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Cada indicador contra su meta, con la tendencia de los últimos 3 meses. Un mes
        fuera de meta pide un plan de acción con causa raíz y acciones con responsable.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {KPI_DEFS.map((def) => (
          <KpiCard
            key={def.kpi}
            def={def}
            meta={metaBy.get(def.kpi) ?? null}
            serie={def.conSerie ? (series.get(def.kpi) ?? []) : []}
            valor={valorActual(def)}
            planBy={planBy}
            puedeEditar={puedeEditar}
            onMetaSaved={refresh}
            onCrearPlan={(ym, valor, meta) => setPlanNuevo({ def, ym, valor, meta })}
            onVerPlan={setPlanVer}
          />
        ))}
      </div>

      {/* Planes de acción */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-slate-400" /> Planes de acción de flota
          </CardTitle>
        </CardHeader>
        <CardContent>
          {planesOrdenados.length === 0 ? (
            <p className="text-sm text-slate-400">
              Sin planes cargados. Se crean desde cada indicador cuando un mes queda
              fuera de meta.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2">Indicador</th>
                  <th>Mes</th>
                  <th className="text-right">Valor</th>
                  <th className="text-right">Meta</th>
                  <th className="pl-4">Causa raíz</th>
                  <th className="text-center">Acciones</th>
                  <th className="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {planesOrdenados.map((p) => {
                  const def = KPI_DEFS.find((d) => d.kpi === p.kpi)
                  const done = p.items.filter((i) => i.estado === "completado").length
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-slate-50"
                      onClick={() => setPlanVer(p)}
                    >
                      <td className="py-2 font-medium text-slate-800">
                        {def?.label ?? p.kpi}
                      </td>
                      <td className="capitalize text-slate-600">
                        {fmtMesLargo(`${p.year}-${pad(p.mes)}`)}
                      </td>
                      <td className="text-right tabular-nums text-slate-600">
                        {p.valor_mes != null && def ? def.fmt(Number(p.valor_mes)) : "—"}
                      </td>
                      <td className="text-right tabular-nums text-slate-600">
                        {p.meta_mes != null && def ? def.fmt(Number(p.meta_mes)) : "—"}
                      </td>
                      <td className="max-w-64 truncate pl-4 text-slate-600">{p.causa_raiz}</td>
                      <td className="text-center tabular-nums text-slate-600">
                        {done}/{p.items.length}
                      </td>
                      <td className="text-center">
                        <EstadoPlanBadge estado={p.estado} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

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
          def={KPI_DEFS.find((d) => d.kpi === planVer.kpi)}
          puedeEditar={puedeEditar}
          esAdmin={esAdmin}
          onClose={() => setPlanVer(null)}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

// ==================== Card de un KPI ====================

function cumpleMeta(valor: number, meta: FlotaMeta | null): boolean | null {
  if (!meta || meta.meta == null) return null
  return meta.comparador === "<=" ? valor <= Number(meta.meta) : valor >= Number(meta.meta)
}

function KpiCard({
  def,
  meta,
  serie,
  valor,
  planBy,
  puedeEditar,
  onMetaSaved,
  onCrearPlan,
  onVerPlan,
}: {
  def: KpiDef
  meta: FlotaMeta | null
  serie: PuntoSerie[]
  valor: number | null
  planBy: Map<string, FlotaPlanConItems>
  puedeEditar: boolean
  onMetaSaved: () => void
  onCrearPlan: (ym: string, valor: number | null, meta: number | null) => void
  onVerPlan: (p: FlotaPlanConItems) => void
}) {
  const [editMeta, setEditMeta] = useState(false)

  const ok = valor == null ? null : cumpleMeta(valor, meta)
  const colorValor =
    ok == null ? "text-slate-900" : ok ? "text-emerald-600" : "text-red-600"

  // Tendencia: compara los dos últimos puntos con dato.
  const conDato = serie.filter((p) => p.valor != null)
  const delta =
    conDato.length >= 2
      ? Number(conDato[conDato.length - 1].valor) - Number(conDato[conDato.length - 2].valor)
      : null
  // Mejora/empeora según el sentido de la meta (<= : bajar es mejorar).
  const mejora = delta == null ? null : meta?.comparador === "<=" ? delta <= 0 : delta >= 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{def.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <p className={cn("text-2xl font-bold tabular-nums", colorValor)}>
            {valor == null ? "—" : def.fmt(valor)}
            {def.conSerie && (
              <span className="ml-1 align-middle text-xs font-normal text-slate-400">
                mes en curso
              </span>
            )}
          </p>
          {delta != null && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                mejora ? "text-emerald-600" : "text-red-600"
              )}
            >
              {delta === 0 ? (
                <Minus className="size-3.5" />
              ) : delta > 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              vs mes anterior
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {editMeta ? (
            <MetaEditor
              def={def}
              meta={meta}
              onDone={() => {
                setEditMeta(false)
                onMetaSaved()
              }}
              onCancel={() => setEditMeta(false)}
            />
          ) : (
            <>
              <span>
                Meta:{" "}
                {meta?.meta == null ? (
                  <span className="italic text-slate-400">sin definir</span>
                ) : (
                  <span className="font-medium text-slate-700">
                    {meta.comparador === "<=" ? "≤ " : "≥ "}
                    {def.fmt(Number(meta.meta))}
                  </span>
                )}
              </span>
              {puedeEditar && (
                <button
                  className="text-slate-400 hover:text-slate-600"
                  onClick={() => setEditMeta(true)}
                  title="Editar meta"
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Tendencia 3 meses (o foto actual) + plan por mes fuera de meta */}
        {def.conSerie ? (
          <div className="grid grid-cols-3 gap-2 border-t pt-2">
            {serie.map((p) => {
              const okMes = p.valor == null ? null : cumpleMeta(p.valor, meta)
              const plan = planBy.get(`${def.kpi}|${p.ym}`)
              return (
                <div key={p.ym} className="text-center">
                  <p className="text-[11px] uppercase text-slate-400">
                    {fmtMesCorto(p.ym)}
                    {p.parcial && "*"}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      okMes == null
                        ? "text-slate-400"
                        : okMes
                          ? "text-emerald-600"
                          : "text-red-600"
                    )}
                  >
                    {p.valor == null ? "—" : def.fmt(p.valor)}
                  </p>
                  {plan ? (
                    <button
                      className="mt-0.5 text-[11px] font-medium text-sky-600 hover:underline"
                      onClick={() => onVerPlan(plan)}
                    >
                      Ver plan
                    </button>
                  ) : okMes === false && puedeEditar ? (
                    <button
                      className="mt-0.5 text-[11px] font-medium text-amber-600 hover:underline"
                      onClick={() => onCrearPlan(p.ym, p.valor, meta?.meta ?? null)}
                    >
                      + Plan
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex items-center justify-between border-t pt-2 text-xs text-slate-500">
            <span>{def.descripcion}</span>
            {ok === false && puedeEditar && (
              <PlanFotoActualBtn def={def} valor={valor} meta={meta} planBy={planBy}
                onCrearPlan={onCrearPlan} onVerPlan={onVerPlan} />
            )}
          </div>
        )}
        {def.conSerie && (
          <p className="text-[11px] leading-tight text-slate-400">{def.descripcion}</p>
        )}
      </CardContent>
    </Card>
  )
}

// Botón de plan para los KPIs de foto actual: el plan se cuelga del mes en curso.
function PlanFotoActualBtn({
  def, valor, meta, planBy, onCrearPlan, onVerPlan,
}: {
  def: KpiDef
  valor: number | null
  meta: FlotaMeta | null
  planBy: Map<string, FlotaPlanConItems>
  onCrearPlan: (ym: string, valor: number | null, meta: number | null) => void
  onVerPlan: (p: FlotaPlanConItems) => void
}) {
  const ym = hoyISO().slice(0, 7)
  const plan = planBy.get(`${def.kpi}|${ym}`)
  return plan ? (
    <button
      className="shrink-0 text-[11px] font-medium text-sky-600 hover:underline"
      onClick={() => onVerPlan(plan)}
    >
      Ver plan
    </button>
  ) : (
    <button
      className="shrink-0 text-[11px] font-medium text-amber-600 hover:underline"
      onClick={() => onCrearPlan(ym, valor, meta?.meta ?? null)}
    >
      + Plan
    </button>
  )
}

function MetaEditor({
  def, meta, onDone, onCancel,
}: {
  def: KpiDef
  meta: FlotaMeta | null
  onDone: () => void
  onCancel: () => void
}) {
  const [valor, setValor] = useState(meta?.meta != null ? String(meta.meta) : "")
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    const num = valor.trim() === "" ? null : Number(valor.replace(",", "."))
    if (num != null && isNaN(num)) {
      toast.error("Meta inválida")
      return
    }
    setSaving(true)
    const res = await updateFlotaMeta({ kpi: def.kpi, meta: num })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Meta actualizada")
    onDone()
  }

  return (
    <div className="flex items-center gap-1.5">
      <span>Meta {meta?.comparador === "<=" ? "≤" : "≥"}</span>
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="h-6 w-24 px-1.5 text-xs"
        placeholder="sin meta"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar()
          if (e.key === "Escape") onCancel()
        }}
      />
      <Button size="sm" className="h-6 px-2 text-xs" onClick={guardar} disabled={saving}>
        {saving ? "…" : "OK"}
      </Button>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onCancel}>
        ✕
      </Button>
    </div>
  )
}

function EstadoPlanBadge({ estado }: { estado: FlotaPlanConItems["estado"] }) {
  const map: Record<string, string> = {
    abierto: "bg-amber-100 text-amber-700",
    en_progreso: "bg-sky-100 text-sky-700",
    cerrado: "bg-emerald-100 text-emerald-700",
  }
  const label: Record<string, string> = {
    abierto: "Abierto",
    en_progreso: "En progreso",
    cerrado: "Cerrado",
  }
  return <Badge className={cn("font-medium", map[estado])}>{label[estado]}</Badge>
}

// ==================== Dialog: crear plan ====================

interface ItemForm {
  accion: string
  responsable: string
  fecha: string
}

function CrearPlanDialog({
  def, ym, valor, meta, onClose, onSaved,
}: {
  def: KpiDef
  ym: string
  valor: number | null
  meta: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [causa, setCausa] = useState("")
  const [items, setItems] = useState<ItemForm[]>([{ accion: "", responsable: "", fecha: "" }])
  const [saving, setSaving] = useState(false)

  const guardar = async () => {
    if (!causa.trim()) {
      toast.error("Cargá la causa raíz")
      return
    }
    const itemsOk = items.filter((i) => i.accion.trim() && i.responsable.trim() && i.fecha)
    if (itemsOk.length === 0) {
      toast.error("Cargá al menos una acción completa (acción, responsable y fecha)")
      return
    }
    setSaving(true)
    const res = await createFlotaPlan({
      kpi: def.kpi,
      mes: Number(ym.slice(5, 7)),
      year: Number(ym.slice(0, 4)),
      valorMes: valor,
      metaMes: meta,
      causaRaiz: causa,
      items: itemsOk.map((i) => ({
        accion: i.accion,
        responsable: i.responsable,
        fechaCompromiso: i.fecha,
      })),
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plan de acción creado")
    onSaved()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Plan de acción — {def.label} · {fmtMesLargo(ym)}
          </DialogTitle>
          <DialogDescription>
            {valor != null && (
              <>
                Valor del mes: <span className="font-medium">{def.fmt(valor)}</span>
                {meta != null && (
                  <>
                    {" "}· Meta: <span className="font-medium">{def.fmt(meta)}</span>
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Causa raíz</Label>
            <Textarea
              value={causa}
              onChange={(e) => setCausa(e.target.value)}
              placeholder="¿Por qué quedó fuera de meta?"
              rows={2}
            />
          </div>

          <div>
            <Label>Acciones</Label>
            <div className="mt-1.5 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={it.accion}
                    onChange={(e) =>
                      setItems(items.map((x, j) => (j === i ? { ...x, accion: e.target.value } : x)))
                    }
                    placeholder="Acción"
                    className="flex-1"
                  />
                  <Input
                    value={it.responsable}
                    onChange={(e) =>
                      setItems(
                        items.map((x, j) => (j === i ? { ...x, responsable: e.target.value } : x))
                      )
                    }
                    placeholder="Responsable"
                    className="w-40"
                  />
                  <Input
                    type="date"
                    value={it.fecha}
                    onChange={(e) =>
                      setItems(items.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))
                    }
                    className="w-40"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-slate-400 hover:text-red-600"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setItems([...items, { accion: "", responsable: "", fecha: "" }])}
            >
              <Plus className="mr-1 size-4" /> Agregar acción
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Crear plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== Dialog: detalle de plan ====================

function DetallePlanDialog({
  plan, def, puedeEditar, esAdmin, onClose, onChanged,
}: {
  plan: FlotaPlanConItems
  def: KpiDef | undefined
  puedeEditar: boolean
  esAdmin: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [nuevo, setNuevo] = useState<ItemForm>({ accion: "", responsable: "", fecha: "" })
  const [resultado, setResultado] = useState("")
  const [cerrando, setCerrando] = useState(false)
  const [saving, setSaving] = useState(false)
  const cerrado = plan.estado === "cerrado"

  const agregarItem = async () => {
    if (!nuevo.accion.trim() || !nuevo.responsable.trim() || !nuevo.fecha) {
      toast.error("Completá acción, responsable y fecha")
      return
    }
    setSaving(true)
    const res = await addFlotaPlanItem({
      planId: plan.id,
      accion: nuevo.accion,
      responsable: nuevo.responsable,
      fechaCompromiso: nuevo.fecha,
    })
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    setNuevo({ accion: "", responsable: "", fecha: "" })
    onChanged()
    onClose()
  }

  const toggleItem = async (id: string, completado: boolean) => {
    const res = await updateFlotaPlanItem({
      id,
      estado: completado ? "completado" : "pendiente",
    })
    if ("error" in res) toast.error(res.error)
    else {
      onChanged()
      onClose()
    }
  }

  const cerrarPlan = async () => {
    if (!resultado.trim()) {
      toast.error("Contá el resultado del plan para cerrarlo")
      return
    }
    setSaving(true)
    const res = await cerrarFlotaPlan(plan.id, resultado)
    setSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Plan cerrado")
    onChanged()
    onClose()
  }

  const borrarPlan = async () => {
    const res = await deleteFlotaPlan(plan.id)
    if ("error" in res) toast.error(res.error)
    else {
      toast.success("Plan eliminado")
      onChanged()
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {def?.label ?? plan.kpi} · {fmtMesLargo(`${plan.year}-${pad(plan.mes)}`)}
            <EstadoPlanBadge estado={plan.estado} />
          </DialogTitle>
          <DialogDescription>
            {plan.valor_mes != null && def && (
              <>
                Valor: <span className="font-medium">{def.fmt(Number(plan.valor_mes))}</span>
              </>
            )}
            {plan.meta_mes != null && def && (
              <>
                {" "}· Meta: <span className="font-medium">{def.fmt(Number(plan.meta_mes))}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Causa raíz</p>
            <p className="mt-0.5 text-sm text-slate-700">{plan.causa_raiz}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-400">Acciones</p>
            <div className="mt-1.5 space-y-1.5">
              {plan.items.length === 0 && (
                <p className="text-sm text-slate-400">Sin acciones cargadas.</p>
              )}
              {plan.items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                  <Checkbox
                    checked={it.estado === "completado"}
                    disabled={!puedeEditar || cerrado}
                    onCheckedChange={(v) => toggleItem(it.id, v === true)}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm text-slate-800",
                        it.estado === "completado" && "text-slate-400 line-through"
                      )}
                    >
                      {it.accion}
                    </p>
                    <p className="text-xs text-slate-500">
                      {it.responsable} · compromiso{" "}
                      {it.fecha_compromiso.slice(0, 10).split("-").reverse().join("/")}
                      {it.fecha_completado &&
                        ` · completado ${it.fecha_completado.slice(0, 10).split("-").reverse().join("/")}`}
                    </p>
                  </div>
                  {puedeEditar && !cerrado && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-slate-400 hover:text-red-600"
                      onClick={async () => {
                        const res = await deleteFlotaPlanItem(it.id)
                        if ("error" in res) toast.error(res.error)
                        else {
                          onChanged()
                          onClose()
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {puedeEditar && !cerrado && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={nuevo.accion}
                  onChange={(e) => setNuevo({ ...nuevo, accion: e.target.value })}
                  placeholder="Nueva acción"
                  className="flex-1"
                />
                <Input
                  value={nuevo.responsable}
                  onChange={(e) => setNuevo({ ...nuevo, responsable: e.target.value })}
                  placeholder="Responsable"
                  className="w-36"
                />
                <Input
                  type="date"
                  value={nuevo.fecha}
                  onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
                  className="w-36"
                />
                <Button size="sm" onClick={agregarItem} disabled={saving}>
                  <Plus className="size-4" />
                </Button>
              </div>
            )}
          </div>

          {cerrado ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="text-xs font-medium uppercase text-emerald-600">
                Cerrado{" "}
                {plan.fecha_cierre &&
                  `el ${plan.fecha_cierre.slice(0, 10).split("-").reverse().join("/")}`}
              </p>
              <p className="mt-0.5">{plan.resultado_cierre}</p>
            </div>
          ) : (
            puedeEditar &&
            (cerrando ? (
              <div className="space-y-2 rounded-md border bg-slate-50 p-3">
                <Label>Resultado del cierre</Label>
                <Textarea
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  placeholder="¿Qué se logró? ¿Volvió a meta?"
                  rows={2}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCerrando(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={cerrarPlan} disabled={saving}>
                    {saving ? "Cerrando…" : "Cerrar plan"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between">
                {esAdmin ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={borrarPlan}
                  >
                    <Trash2 className="mr-1 size-4" /> Eliminar
                  </Button>
                ) : (
                  <span />
                )}
                <Button variant="outline" size="sm" onClick={() => setCerrando(true)}>
                  Cerrar plan
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

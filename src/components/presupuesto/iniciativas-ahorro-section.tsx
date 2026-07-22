"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  Target,
  Wallet,
  CheckCircle2,
  Info,
  LineChart as LineChartIcon,
} from "lucide-react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { abrirArchivo as abrirArchivoEnVisor } from "@/lib/abrir-archivo"
import { getSignedUrl } from "@/actions/presupuesto"
import { eliminarIniciativa } from "@/actions/presupuesto-iniciativas"
import type { EjecucionRubro } from "@/actions/presupuesto-generador"
import type { KpiPerdidas } from "@/actions/presupuesto-perdidas-kpi"
import type { KpiCombustible } from "@/actions/presupuesto-combustible-kpi"
import type { IniciativaAhorroConDetalle } from "@/types/database"
import {
  ESTADO_BADGE_CLASS,
  ESTADO_LABEL,
  TIPO_LABEL,
  TRIMESTRES,
} from "./iniciativas-constantes"
import { IniciativaFormDialog } from "./iniciativa-form-dialog"
import { SeguimientoIniciativaDialog } from "./seguimiento-iniciativa-dialog"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

interface Props {
  anio: number
  iniciativas: IniciativaAhorroConDetalle[]
  /** Presupuestado vs real acumulado por rubro del EERR (rubro normalizado). */
  ejecucionRubros: Record<string, EjecucionRubro>
  /** KPI físico por rubro (lo perdido por HL vendido). Vacío si no aplica. */
  kpiPerdidas: Record<string, KpiPerdidas>
  /** KPI físico de combustible (km/l), indexado por nombre de KPI. */
  kpiCombustible: Record<string, KpiCombustible>
  responsables: ResponsableOpt[]
  puedeEditar: boolean
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatNum(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)
}

// Fracción de cumplimiento del KPI (0 = sin avance, 1 = objetivo alcanzado).
// Puede dar negativo si la métrica empeoró respecto de la línea base.
function cumplimientoKpi(
  base: number | null,
  objetivo: number | null,
  valor: number | null,
  mejorSi: "menor" | "mayor",
): number | null {
  if (base === null || objetivo === null || valor === null) return null
  const span = mejorSi === "menor" ? base - objetivo : objetivo - base
  if (span === 0) return null
  const avance = mejorSi === "menor" ? base - valor : valor - base
  return avance / span
}

function SemaforoBadge({ frac }: { frac: number | null }) {
  if (frac === null) {
    return <span className="text-xs text-muted-foreground">Sin datos</span>
  }
  const pct = Math.round(frac * 100)
  if (frac >= 1) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Cumplido · {pct}%
      </Badge>
    )
  }
  if (frac >= 0.5) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En progreso · {pct}%
      </Badge>
    )
  }
  if (frac >= 0) {
    return (
      <Badge className="border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-100">
        Bajo · {pct}%
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      Empeoró · {pct}%
    </Badge>
  )
}

function barColor(frac: number | null): string {
  if (frac === null) return "bg-slate-300"
  if (frac >= 1) return "bg-emerald-500"
  if (frac >= 0.5) return "bg-amber-500"
  if (frac >= 0) return "bg-orange-500"
  return "bg-red-500"
}

/** Paleta de las series del KPI de combustible. */
const COMB_COLOR_GRUPO = "#0f766e"
const COMB_COLOR_INTERVENIDOS = "#2563eb"
const COMB_COLOR_REF = "#94a3b8"

const MES_CORTO = [
  "",
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
]

/**
 * KPI físico del rubro: cuánto se rompe/vence por cada millón de HL vendidos,
 * mes a mes, contra el target del presupuesto.
 *
 * Va en ppm y no en % porque los números son chicos: roturas ronda 0,04% y
 * vencidos 0,003%, y a esa escala un tablero se vuelve ilegible (0,0002% vs
 * 0,0071% no se compara de un vistazo; 2 ppm vs 71 sí).
 */
function KpiPerdidasBlock({
  kpi,
  rubro,
  ejec,
  mesInicio,
}: {
  kpi: KpiPerdidas
  rubro: string
  ejec: EjecucionRubro | undefined
  mesInicio: number
}) {
  const [mesAbierto, setMesAbierto] = useState<number | null>(null)
  const cumpleAcum = kpi.realPpmAcum <= kpi.targetPpmAcum
  const esVencido = rubro === "PRODUCTO VENCIDO"
  const detalle = kpi.meses.find((m) => m.mes === mesAbierto) ?? null
  const pesos = ejec?.porMes.find((p) => p.mes === mesAbierto) ?? null

  // Escala log cuando la serie cruza órdenes de magnitud. En vencidos el target
  // va de 1 ppm (abril) a 1.776 (junio, temporada baja): en escala lineal el eje
  // se estira a 1.800 y el real —que va de 2 a 74— queda aplastado contra el
  // piso, que es justo lo que se quiere mirar. Log necesita que no haya ceros.
  const valores = kpi.meses.flatMap((m) => [m.realPpm, m.targetPpm])
  const minVal = Math.min(...valores)
  const maxVal = Math.max(...valores)
  const usarLog = minVal > 0 && maxVal / minVal >= 50

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {esVencido ? "Vencido" : "Roto"} por HL vendido (ppm)
          {/* Que la escala no engañe: en log, una caída a la mitad y una a la
              décima parte se ven casi igual de empinadas. */}
          {usarLog && (
            <span className="ml-1 text-xs opacity-70">· escala log</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-slate-900">
            target <strong>{Math.round(kpi.targetPpmAcum)}</strong>
            <span className="text-muted-foreground"> · real </span>
            <strong>{Math.round(kpi.realPpmAcum)}</strong>
          </span>
          <Badge
            className={
              cumpleAcum
                ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                : "border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
            }
          >
            {cumpleAcum ? "Cumple" : "Excede"}
          </Badge>
        </span>
      </div>
      {/* La evolución, que es lo que el semáforo no muestra: roturas arrastra
          enero (2.036 ppm) y desde marzo viene en ~400. La línea punteada es el
          target de CADA mes, que se mueve con el presupuesto. */}
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={kpi.meses.map((m) => ({
              mes: MES_CORTO[m.mes],
              real: Math.round(m.realPpm),
              target: Math.round(m.targetPpm),
            }))}
            margin={{ top: 5, right: 14, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="capitalize" />
            <YAxis
              tick={{ fontSize: 11 }}
              width={44}
              scale={usarLog ? "log" : "auto"}
              domain={usarLog ? ["dataMin", "dataMax"] : [0, "auto"]}
              allowDataOverflow={usarLog}
            />
            <Tooltip
              formatter={(v, n) => [`${v} ppm`, n === "real" ? "Real" : "Target"]}
              labelClassName="capitalize"
              contentStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="target"
              name="target"
              stroke="#94a3b8"
              strokeDasharray="4 3"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="real"
              name="real"
              stroke={cumpleAcum ? "#059669" : "#dc2626"}
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* El color dice si el mes cumplió; el detalle se abre al clic para no
          llenar la tarjeta de números. */}
      <div className="flex flex-wrap gap-1.5">
        {kpi.meses.map((m) => {
          const ok = m.realPpm <= m.targetPpm
          return (
            <button
              key={m.mes}
              type="button"
              onClick={() => setMesAbierto(m.mes)}
              title={`Ver el detalle de ${MES_NOMBRE[m.mes]}`}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-opacity hover:opacity-80 ${
                ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              } ${m.mes < mesInicio ? "opacity-50" : ""}`}
            >
              {MES_CORTO[m.mes]}
            </button>
          )
        })}
      </div>

      <Dialog
        open={mesAbierto !== null}
        onOpenChange={(o) => !o && setMesAbierto(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {detalle ? MES_NOMBRE[detalle.mes] : ""} — {rubro}
            </DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-4 text-sm">
              {/* Antes de implementarla, el mes no le cuenta a la iniciativa:
                  el rubro gastaba lo que gastaba sin ella. */}
              {detalle.mes < mesInicio && (
                <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  Este mes es anterior a la implementación
                  {mesInicio <= 12 && ` (${MES_NOMBRE[mesInicio]})`}: no cuenta
                  para el ahorro de la iniciativa.
                </p>
              )}

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Plata
                </p>
                <FilaDetalle
                  etiqueta="Presupuestado"
                  valor={pesos ? formatMoney(pesos.presup) : "—"}
                />
                <FilaDetalle
                  etiqueta="Real"
                  valor={pesos ? formatMoney(pesos.real) : "—"}
                />
                {pesos && (
                  <FilaDetalle
                    etiqueta={
                      pesos.presup - pesos.real >= 0 ? "Ahorro" : "Gasto de más"
                    }
                    valor={formatMoney(Math.abs(pesos.presup - pesos.real))}
                    className={
                      pesos.presup - pesos.real >= 0
                        ? "text-emerald-700"
                        : "text-red-600"
                    }
                  />
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Volumen {esVencido ? "vencido" : "roto"}
                </p>
                <FilaDetalle
                  etiqueta={`HL presupuestados a ${esVencido ? "vencerse" : "romperse"}`}
                  valor={formatNum(detalle.targetHl)}
                />
                <FilaDetalle
                  etiqueta={`HL reales ${esVencido ? "vencidos" : "rotos"}`}
                  valor={formatNum(detalle.realHl)}
                  className={
                    detalle.realHl <= detalle.targetHl
                      ? "text-emerald-700"
                      : "text-red-600"
                  }
                />
                {/* La unidad nativa del ppto: los HL salen de convertir esto. */}
                <FilaDetalle
                  etiqueta="Bultos (ppto → real)"
                  valor={`${formatNum(detalle.targetBultos)} → ${formatNum(detalle.realBultos)}`}
                />
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  El ratio = HL {esVencido ? "vencidos" : "rotos"} ÷ HL vendidos
                </p>
                {/* El ratio ES la división, no los HL vendidos sueltos: se
                    muestra la cuenta completa de los dos lados. ppm = por millón,
                    para que el número sea legible (roturas ~0,04%). */}
                <FilaDetalle
                  etiqueta="Target (presupuesto)"
                  valor={`${formatNum(detalle.targetHl)} ÷ ${formatNum(Math.round(detalle.hlVendidosPpto))} HL proyectados = ${Math.round(detalle.targetPpm)} ppm`}
                />
                <FilaDetalle
                  etiqueta="Real"
                  valor={`${formatNum(detalle.realHl)} ÷ ${formatNum(Math.round(detalle.hlVendidosReal))} HL vendidos = ${Math.round(detalle.realPpm)} ppm`}
                  className={
                    detalle.realPpm <= detalle.targetPpm
                      ? "text-emerald-700"
                      : "text-red-600"
                  }
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  ppm = partes por millón del volumen vendido (
                  {Math.round(detalle.realPpm)} ppm ={" "}
                  {(detalle.realPpm / 10000).toFixed(4)}%).
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * KPI físico de las iniciativas de combustible: km por litro mes a mes.
 *
 * A diferencia del de pérdidas, acá **más alto es mejor** y el target no viene
 * del presupuesto sino del objetivo cargado en la propia iniciativa, así que se
 * dibuja como línea horizontal junto con la línea base.
 *
 * Cuando la mejora se instaló sólo en parte del grupo, se separa la serie de
 * los camiones intervenidos: los no intervenidos funcionan como grupo de
 * control y es la única forma de distinguir el efecto de la iniciativa de la
 * variación normal del rendimiento entre meses.
 */
function KpiCombustibleBlock({
  kpi,
  unidad,
  lineaBase,
  objetivo,
  mesInstalacion,
}: {
  kpi: KpiCombustible
  unidad: string
  lineaBase: number | null
  objetivo: number | null
  mesInstalacion: number | null
}) {
  const hayControl =
    kpi.dominiosIntervenidos.length > 0 &&
    kpi.dominiosIntervenidos.length < kpi.dominios.length

  // Referencia contra la que se pinta el semáforo: el objetivo si está cargado,
  // si no la línea base (mejorar respecto del punto de partida).
  const referencia = objetivo ?? lineaBase
  const cumpleAcum =
    kpi.realAcum !== null && referencia !== null && kpi.realAcum >= referencia

  const datos = kpi.meses.map((m) => ({
    mes: MES_CORTO[m.mes],
    real: m.real,
    intervenidos: hayControl ? m.intervenidos : null,
    objetivo,
    base: lineaBase,
  }))

  // El eje NO arranca en cero: todos los valores viven entre 3 y 4 km/l, y con
  // el cero adentro las diferencias que importan (±0,1) se vuelven invisibles.
  const valores = [
    ...kpi.meses.flatMap((m) =>
      [m.real, hayControl ? m.intervenidos : null].filter(
        (v): v is number => v !== null,
      ),
    ),
    ...(objetivo !== null ? [objetivo] : []),
    ...(lineaBase !== null ? [lineaBase] : []),
  ]
  const minVal = valores.length > 0 ? Math.min(...valores) : 0
  const maxVal = valores.length > 0 ? Math.max(...valores) : 1
  const pad = Math.max((maxVal - minVal) * 0.15, 0.1)
  const dominioY: [number, number] = [
    Math.max(0, Number((minVal - pad).toFixed(2))),
    Number((maxVal + pad).toFixed(2)),
  ]

  const mesInstalCorto =
    mesInstalacion !== null && mesInstalacion >= 1 && mesInstalacion <= 12
      ? MES_CORTO[mesInstalacion]
      : null
  const mostrarMarcaInstal =
    mesInstalCorto !== null && datos.some((d) => d.mes === mesInstalCorto)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Rendimiento ({unidad})
          {hayControl && (
            <span className="ml-1 text-xs opacity-70">
              · {kpi.dominiosIntervenidos.length} de {kpi.dominios.length}{" "}
              con la mejora
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-slate-900">
            {objetivo !== null && (
              <>
                objetivo <strong>{formatNum(objetivo)}</strong>
                <span className="text-muted-foreground"> · </span>
              </>
            )}
            real <strong>{formatNum(kpi.realAcum)}</strong>
          </span>
          <Badge
            className={
              cumpleAcum
                ? "border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                : "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100"
            }
          >
            {cumpleAcum ? "Cumple" : "En progreso"}
          </Badge>
        </span>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 5, right: 14, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} className="capitalize" />
            <YAxis tick={{ fontSize: 11 }} width={44} domain={dominioY} />
            <Tooltip
              formatter={(v, n) => [
                v === null ? "—" : `${formatNum(Number(v))} ${unidad}`,
                n === "real"
                  ? "Grupo"
                  : n === "intervenidos"
                    ? "Con la mejora"
                    : n === "objetivo"
                      ? "Objetivo"
                      : "Línea base",
              ]}
              labelClassName="capitalize"
              contentStyle={{ fontSize: 12 }}
            />
            {/* Desde este mes corre la iniciativa: sin la marca, el gráfico no
                dice qué parte de la serie es "antes" y qué parte "después". */}
            {mostrarMarcaInstal && (
              <ReferenceLine
                x={mesInstalCorto}
                stroke="#0f172a"
                strokeDasharray="2 2"
                label={{
                  value: "instalación",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#0f172a",
                }}
              />
            )}
            {lineaBase !== null && (
              <Line
                type="monotone"
                dataKey="base"
                name="base"
                stroke={COMB_COLOR_REF}
                strokeDasharray="2 4"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {objetivo !== null && (
              <Line
                type="monotone"
                dataKey="objetivo"
                name="objetivo"
                stroke={COMB_COLOR_REF}
                strokeDasharray="4 3"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {hayControl && (
              <Line
                type="monotone"
                dataKey="intervenidos"
                name="intervenidos"
                stroke={COMB_COLOR_INTERVENIDOS}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="real"
              name="real"
              stroke={COMB_COLOR_GRUPO}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Un mes con pocas cargas mueve el número varios puntos: el conteo va a
          la vista para no leer como tendencia lo que es ruido de muestra. */}
      <div className="flex flex-wrap gap-1.5">
        {kpi.meses.map((m) => {
          const ok =
            m.real !== null && referencia !== null && m.real >= referencia
          return (
            <span
              key={m.mes}
              title={`${m.cargas} cargas · ${m.km.toLocaleString("es-AR")} km · ${m.litros.toLocaleString("es-AR")} lts`}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize ${
                ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {MES_CORTO[m.mes]} {formatNum(m.real)}
              <span className="ml-1 opacity-60">({m.cargas})</span>
            </span>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {kpi.dominios.join(" · ")}
        {hayControl && (
          <>
            {" "}
            — con la mejora: {kpi.dominiosIntervenidos.join(" y ")}
            {kpi.controlAcum !== null && (
              <> · control {formatNum(kpi.controlAcum)} {unidad}</>
            )}
          </>
        )}
        {kpi.cargasDescartadas > 0 && (
          <>
            {" "}
            · {kpi.cargasDescartadas} carga
            {kpi.cargasDescartadas === 1 ? "" : "s"} descartada
            {kpi.cargasDescartadas === 1 ? "" : "s"} por odómetro o carga
            incompleta
          </>
        )}
      </p>
    </div>
  )
}

function FilaDetalle({
  etiqueta,
  valor,
  className,
}: {
  etiqueta: string
  valor: string
  className?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={`font-medium tabular-nums ${className ?? "text-slate-900"}`}>
        {valor}
      </span>
    </div>
  )
}

/** Índice 1-12 (el 0 queda sin usar para no restar en cada lectura). */
const MES_NOMBRE = [
  "",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]

/**
 * Primer mes del año en que la iniciativa está vigente. Antes de esa fecha el
 * rubro gastaba lo que gastaba sin ella, así que ese gasto no es ni mérito ni
 * culpa de la iniciativa. Sin fecha, se asume vigente todo el año.
 */
function mesInicioDe(ini: IniciativaAhorroConDetalle): number {
  if (!ini.fecha_implementacion) return 1
  const d = new Date(`${ini.fecha_implementacion}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 1
  if (d.getFullYear() < ini.anio) return 1
  if (d.getFullYear() > ini.anio) return 13 // arranca después de este año
  return d.getMonth() + 1
}

/**
 * Ahorro REAL de una iniciativa y contra qué se lo mide.
 *
 * Con rubro, sale del EERR: presupuestado − gasto real, sumando SÓLO los meses
 * cerrados desde que la iniciativa está vigente. Es la misma vara con la que se
 * fijó el compromiso (% del presupuesto), así que se pueden comparar. Antes el
 * ahorro se cargaba a mano y contra el gasto del año ANTERIOR: "Roturas"
 * declaraba $1,12M ahorrados cuando contra el presupuesto venía $1,81M por
 * encima — dos varas distintas en la misma barra.
 *
 * Sin rubro (iniciativas cuyo ahorro no sale de un rubro del EERR) se mantiene la
 * suma de lo cargado a mano en los seguimientos.
 */
function ahorroDe(
  ini: IniciativaAhorroConDetalle,
  ejecucion: EjecucionRubro | undefined,
): {
  real: number
  /** Meses cerrados COMPUTADOS (los vigentes), no los del año. */
  meses: number | null
  mesInicio: number
  /** Meses que la iniciativa está vigente en el año: la base del prorrateo. */
  mesesVigentes: number
  /** Presupuestado y gastado de los meses computados (para explicar el número). */
  presupComputado: number
  gastoComputado: number
  fuente: "eerr" | "manual"
} {
  const mesInicio = mesInicioDe(ini)
  const mesesVigentes = Math.max(0, 13 - mesInicio)
  if (ini.rubro && ejecucion) {
    const computados = ejecucion.porMes.filter((m) => m.mes >= mesInicio)
    const presupComputado = computados.reduce((acc, m) => acc + m.presup, 0)
    const gastoComputado = computados.reduce((acc, m) => acc + m.real, 0)
    return {
      real: presupComputado - gastoComputado,
      meses: computados.length,
      mesInicio,
      mesesVigentes,
      presupComputado,
      gastoComputado,
      fuente: "eerr",
    }
  }
  return {
    real: ini.seguimientos.reduce((acc, s) => acc + (s.ahorro_real ?? 0), 0),
    meses: null,
    mesInicio,
    mesesVigentes,
    presupComputado: 0,
    gastoComputado: 0,
    fuente: "manual",
  }
}

/**
 * Cuánto del desvío se explica por haber vendido distinto de lo previsto.
 *
 * El presupuesto de roturas/vencidos se armó para un volumen PROYECTADO: si se
 * vende más, se rompe más, y el ahorro contra el ppto plano castiga a la
 * iniciativa por algo que no maneja. Roturas desde febrero: el ppto suponía
 * 47.784 HL y se vendieron 55.043 (+15,2%). Contra el ppto plano queda en
 * −$35.100, pero por HL mejoró (70,09 → 61,49 $/HL) y a volumen real ahorró
 * $473.740 — el signo se da vuelta.
 *
 * No cambia el ahorro publicado (el compromiso es contra el ppto aprobado): se
 * informa al lado, que es lo que pidió el usuario.
 */
function ajustePorVolumen(
  kpi: KpiPerdidas,
  mesInicio: number,
  presupComputado: number,
  gastoComputado: number,
): {
  hlPpto: number
  hlReal: number
  desvioPct: number
  pptoAjustado: number
  ahorroAjustado: number
} | null {
  const meses = kpi.meses.filter((m) => m.mes >= mesInicio)
  if (meses.length === 0 || presupComputado <= 0) return null
  const hlPpto = meses.reduce((a, m) => a + m.hlVendidosPpto, 0)
  const hlReal = meses.reduce((a, m) => a + m.hlVendidosReal, 0)
  if (hlPpto <= 0) return null
  const pptoAjustado = (presupComputado / hlPpto) * hlReal
  return {
    hlPpto,
    hlReal,
    desvioPct: (hlReal / hlPpto - 1) * 100,
    pptoAjustado,
    ahorroAjustado: pptoAjustado - gastoComputado,
  }
}

/** Trimestres ya CERRADOS del año, a hoy. Fallback cuando no hay EERR. */
function trimestresCerrados(anio: number, hoy = new Date()): number {
  if (anio < hoy.getFullYear()) return 4
  if (anio > hoy.getFullYear()) return 0
  return Math.floor(hoy.getMonth() / 3) // ene-mar → 0 cerrados; jul → 2
}

/**
 * Ahorro que debería llevar acumulado a esta altura.
 *
 * Con meta en % del rubro, es ese % aplicado al presupuesto de los meses ya
 * cerrados. Es lo que hace que "bajar 10% al año" y "bajar 10% por mes" sean la
 * MISMA meta: el 10% de cada mes suma el 10% del año.
 *
 * No se prorratea en cuotas iguales porque el presupuesto no es plano y eso
 * deformaba la meta mes a mes: en roturas el ppto de junio ($468.796) es un
 * tercio del de diciembre ($1.290.411), y la cuota lineal ($94.813) le exigía a
 * junio el 20% y a diciembre el 7,3% — la misma meta pesando el doble o la mitad
 * según el mes. Junio, encima, es uno de los meses que la tarjeta pinta en rojo.
 *
 * Sin meta en % (compromiso cargado a mano) no hay a qué aplicarle el %, así que
 * ahí sí se prorratea por meses: es lo único que se puede hacer.
 */
function esperadoALaFecha(
  ini: IniciativaAhorroConDetalle,
  presupComputado: number,
  fuente: "eerr" | "manual",
  mesesTranscurridos: number,
  mesesVigentes: number,
): number | null {
  if (
    fuente === "eerr" &&
    ini.ahorro_pct_objetivo !== null &&
    ini.ahorro_pct_objetivo > 0 &&
    presupComputado > 0
  ) {
    return (presupComputado * ini.ahorro_pct_objetivo) / 100
  }
  const comprometidoAnual = ini.ahorro_comprometido_anual
  if (comprometidoAnual === null || comprometidoAnual <= 0) return null
  if (mesesVigentes <= 0) return null
  return (comprometidoAnual * mesesTranscurridos) / mesesVigentes
}

/** Cómo viene el ahorro contra el ritmo, no contra el año entero. */
function RitmoBadge({
  frac,
  meses,
  mesesVigentes,
}: {
  frac: number | null
  meses: number
  mesesVigentes: number
}) {
  if (meses === 0) {
    return <span className="text-xs text-muted-foreground">Sin meses cerrados</span>
  }
  if (frac === null) {
    return <span className="text-xs text-muted-foreground">Sin ahorro cargado</span>
  }
  const pct = Math.round(frac * 100)
  const detalle = `${pct}% del ritmo · ${meses} de ${mesesVigentes} meses`
  if (frac < 0) {
    return (
      <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
        Gastando de más · {detalle}
      </Badge>
    )
  }
  if (frac >= 1.25) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Por encima del ritmo · {detalle}
      </Badge>
    )
  }
  if (frac >= 0.9) {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        En ritmo · {detalle}
      </Badge>
    )
  }
  if (frac >= 0.5) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        Atrasada · {detalle}
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      Muy atrasada · {detalle}
    </Badge>
  )
}

export function IniciativasAhorroSection({
  anio,
  iniciativas,
  ejecucionRubros,
  kpiPerdidas,
  kpiCombustible,
  responsables,
  puedeEditar,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [openForm, setOpenForm] = useState(false)
  const [editando, setEditando] =
    useState<IniciativaAhorroConDetalle | null>(null)
  const [seguimientoDe, setSeguimientoDe] =
    useState<IniciativaAhorroConDetalle | null>(null)
  const [trimestreInicial, setTrimestreInicial] = useState<number>(1)

  function refrescar() {
    router.refresh()
  }

  async function abrirArchivo(url: string | null) {
    if (!url) return
    const result = await getSignedUrl(url)
    if ("error" in result) {
      alert(`Error abriendo archivo: ${result.error}`)
      return
    }
    abrirArchivoEnVisor(result.data.url)
  }

  function handleEliminar(ini: IniciativaAhorroConDetalle) {
    if (
      !confirm(
        `¿Eliminar la iniciativa "${ini.titulo}"? Se borran también sus avances trimestrales. No se puede deshacer.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await eliminarIniciativa(ini.id)
      if ("error" in result) {
        alert(`Error: ${result.error}`)
        return
      }
      refrescar()
    })
  }

  function abrirSeguimiento(ini: IniciativaAhorroConDetalle, q: number) {
    setTrimestreInicial(q)
    setSeguimientoDe(ini)
  }

  // Totales para las tarjetas resumen
  const resumen = useMemo(() => {
    let comprometido = 0
    let realAcum = 0
    let implementadas = 0
    for (const ini of iniciativas) {
      comprometido += ini.ahorro_comprometido_anual ?? 0
      // Por la MISMA vía que la tarjeta de cada iniciativa (EERR si hay rubro,
      // seguimientos si no): sumar acá los seguimientos a mano daba un total que
      // no coincidía con lo que mostraban las tarjetas de abajo.
      realAcum += ahorroDe(
        ini,
        ini.rubro ? ejecucionRubros[ini.rubro.trim().toUpperCase()] : undefined,
      ).real
      if (ini.estado === "implementada") implementadas++
    }
    return { comprometido, realAcum, implementadas }
  }, [iniciativas, ejecucionRubros])

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="size-5 shrink-0 text-blue-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Rutina de Campeones — Iniciativas de Ahorro (5.2)
            </p>
            <p className="mt-1">
              Cargá las iniciativas comprometidas y seguí{" "}
              <strong>trimestralmente</strong> el ahorro real y la métrica
              comprometida para ver si realmente funcionaron. El ahorro debería
              estar reflejado en el presupuesto del año (bloque 1).
            </p>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <LineChartIcon className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Iniciativas</p>
              <p className="text-lg font-bold text-slate-900">
                {iniciativas.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Target className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Ahorro comprometido
              </p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatMoney(resumen.comprometido)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <Wallet className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Ahorro real acumulado
              </p>
              <p className="truncate text-lg font-bold text-slate-900">
                {formatMoney(resumen.realAcum)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Implementadas</p>
              <p className="text-lg font-bold text-slate-900">
                {resumen.implementadas}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Acción */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Iniciativas {anio}
        </h2>
        {puedeEditar && (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditando(null)
              setOpenForm(true)
            }}
          >
            <Plus className="mr-2 size-4" />
            Nueva iniciativa
          </Button>
        )}
      </div>

      {/* Lista de iniciativas */}
      {iniciativas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sin iniciativas de ahorro cargadas para {anio}.
            {puedeEditar && (
              <>
                {" "}
                <button
                  className="font-medium text-blue-600 hover:underline"
                  onClick={() => {
                    setEditando(null)
                    setOpenForm(true)
                  }}
                >
                  Cargá la primera
                </button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {iniciativas.map((ini) => {
            const ejec = ini.rubro
              ? ejecucionRubros[ini.rubro.trim().toUpperCase()]
              : undefined
            const kpiPerd = ini.rubro
              ? kpiPerdidas[ini.rubro.trim().toUpperCase()]
              : undefined
            // Las iniciativas de flota no tienen rubro del EERR: su serie se
            // indexa por el nombre del KPI comprometido.
            const kpiComb = ini.kpi_nombre
              ? kpiCombustible[ini.kpi_nombre.trim().toUpperCase()]
              : undefined
            const mesInstalacion = ini.fecha_implementacion
              ? Number(ini.fecha_implementacion.slice(5, 7))
              : null
            const {
              real: realAcum,
              meses: mesesEerr,
              mesInicio,
              mesesVigentes,
              presupComputado,
              gastoComputado,
              fuente,
            } = ahorroDe(ini, ejec)
            const ahorroFrac =
              ini.ahorro_comprometido_anual && ini.ahorro_comprometido_anual > 0
                ? realAcum / ini.ahorro_comprometido_anual
                : null
            // último valor de KPI (mayor trimestre con dato)
            const conKpi = [...ini.seguimientos]
              .filter((s) => s.kpi_valor !== null)
              .sort((a, b) => b.trimestre - a.trimestre)
            const ultimoKpi = conKpi.length > 0 ? conKpi[0].kpi_valor : null
            const ultimoKpiQ = conKpi.length > 0 ? conKpi[0].trimestre : null
            const kpiFrac = cumplimientoKpi(
              ini.kpi_linea_base,
              ini.kpi_objetivo,
              ultimoKpi,
              ini.kpi_mejor_si,
            )
            // Ritmo: lo acumulado contra lo que debería llevar a esta altura,
            // no contra el compromiso anual entero. La ventana son los meses que
            // el EERR tiene cerrados (o los trimestres del calendario si el
            // ahorro es manual).
            const qCerrados = trimestresCerrados(ini.anio)
            const mesesTranscurridos =
              mesesEerr ?? Math.max(0, qCerrados * 3 - (mesInicio - 1))
            const esperado = esperadoALaFecha(
              ini,
              presupComputado,
              fuente,
              mesesTranscurridos,
              mesesVigentes,
            )
            const ritmoFrac = esperado && esperado > 0 ? realAcum / esperado : null
            // Cuánto del desvío es volumen y no gestión: el ppto se armó para un
            // volumen proyectado y se vendió otro.
            const ajusteVol =
              kpiPerd && fuente === "eerr"
                ? ajustePorVolumen(
                    kpiPerd,
                    mesInicio,
                    presupComputado,
                    gastoComputado,
                  )
                : null
            // El último comentario cargado es el análisis de la iniciativa: es lo
            // más valioso que se carga y estaba escondido dentro del diálogo.
            const ultimoSeg = [...ini.seguimientos]
              .filter((s) => (s.comentario ?? "").trim() !== "")
              .sort((a, b) => b.trimestre - a.trimestre)[0]
            const tipoLabel =
              ini.tipo === "otro" && ini.tipo_otro
                ? ini.tipo_otro
                : TIPO_LABEL[ini.tipo]

            return (
              <Card key={ini.id}>
                <CardContent className="space-y-4 py-4">
                  {/* Cabecera */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                          {tipoLabel}
                        </Badge>
                        <Badge
                          className={`${ESTADO_BADGE_CLASS[ini.estado]} hover:opacity-100`}
                        >
                          {ESTADO_LABEL[ini.estado]}
                        </Badge>
                        {ini.incluida_en_presupuesto && (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                            En presupuesto
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 font-semibold text-slate-900">
                        {ini.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ini.responsable_nombre ?? "Sin responsable"}
                        {ini.fecha_implementacion &&
                          ` · Implementación: ${ini.fecha_implementacion}`}
                      </p>
                      {ini.descripcion && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {ini.descripcion}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {puedeEditar && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => abrirSeguimiento(ini, 1)}
                            title="Cargar avance trimestral"
                          >
                            <TrendingUp className="mr-1 size-3.5" />
                            Avance
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditando(ini)
                              setOpenForm(true)
                            }}
                            title="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEliminar(ini)}
                            title="Eliminar"
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Ahorro: una sola barra, contra el RITMO esperado a esta
                      altura del año. El KPI va como línea de texto: es la causa,
                      el ahorro es el efecto — dos barras iguales no dejaban ver
                      cuál manda. */}
                  <div className="rounded-lg border bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        Ahorro real acumulado
                        {fuente === "eerr" && ejec && (
                          <>
                            {" "}
                            · presupuesto − real del rubro, {mesesEerr}{" "}
                            {mesesEerr === 1 ? "mes" : "meses"} del EERR
                            {/* Si arranca a mitad de año, decir desde cuándo se
                                cuenta: el gasto previo no es de la iniciativa. */}
                            {mesInicio > 1 && ` desde ${MES_NOMBRE[mesInicio]}`}
                          </>
                        )}
                      </span>
                      {esperado !== null && (
                        <RitmoBadge
                          frac={ritmoFrac}
                          meses={mesesTranscurridos}
                          mesesVigentes={mesesVigentes}
                        />
                      )}
                    </div>
                    <p
                      className={`mt-1 text-sm font-medium ${realAcum < 0 ? "text-red-600" : "text-slate-900"}`}
                    >
                      {formatMoney(realAcum)}
                      {esperado !== null && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          de {formatMoney(esperado)} esperados a esta altura
                        </span>
                      )}
                    </p>
                    {/* Un ahorro negativo no es "poco ahorro": es gasto de más. */}
                    {realAcum < 0 && fuente === "eerr" && (
                      <p className="mt-1 text-xs text-red-600">
                        Va {formatMoney(Math.abs(realAcum))} POR ENCIMA del
                        presupuesto del rubro ({formatMoney(gastoComputado)}{" "}
                        gastados contra {formatMoney(presupComputado)}{" "}
                        presupuestados
                        {mesInicio > 1 && `, desde ${MES_NOMBRE[mesInicio]}`}).
                      </p>
                    )}
                    {/* El ppto se armó para un volumen PROYECTADO: si se vendió
                        más, se rompe más, y el ahorro contra el ppto plano
                        castiga a la iniciativa por algo que no maneja. */}
                    {ajusteVol && Math.abs(ajusteVol.desvioPct) >= 5 && (
                      <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                        El presupuesto se armó para{" "}
                        {formatNum(Math.round(ajusteVol.hlPpto))} HL y se
                        vendieron {formatNum(Math.round(ajusteVol.hlReal))} (
                        {ajusteVol.desvioPct > 0 ? "+" : ""}
                        {formatNum(Number(ajusteVol.desvioPct.toFixed(1)))}%):{" "}
                        {ajusteVol.desvioPct > 0 ? "más" : "menos"} volumen
                        vendido,{" "}
                        {ajusteVol.desvioPct > 0 ? "más" : "menos"}{" "}
                        {ini.rubro === "PRODUCTO VENCIDO" ? "vencido" : "roturas"}
                        . A volumen real el presupuesto equivalente es{" "}
                        {formatMoney(Math.round(ajusteVol.pptoAjustado))}, así que
                        el ahorro ajustado sería{" "}
                        <strong
                          className={
                            ajusteVol.ahorroAjustado >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                          }
                        >
                          {ajusteVol.ahorroAjustado >= 0 ? "+" : "−"}
                          {formatMoney(Math.abs(Math.round(ajusteVol.ahorroAjustado)))}
                        </strong>
                        .
                      </p>
                    )}
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full ${barColor(ritmoFrac)}`}
                        style={{
                          width: `${Math.max(0, Math.min(100, (ritmoFrac ?? 0) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Compromiso anual {formatMoney(ini.ahorro_comprometido_anual)}
                      {/* De dónde sale la meta, si se definió como % del rubro. */}
                      {ini.rubro && ini.ahorro_pct_objetivo !== null && (
                        <>
                          {" "}
                          = {formatNum(ini.ahorro_pct_objetivo)}% de{" "}
                          {formatMoney(ini.presupuesto_rubro_anual)} ({ini.rubro})
                        </>
                      )}
                      {ahorroFrac !== null &&
                        ` · ${Math.round(ahorroFrac * 100)}% del año cubierto`}
                      {qCerrados === 0 && " · el año todavía no cerró un trimestre"}
                    </p>
                  </div>

                  {/* KPI comprometido: la métrica que mueve el ahorro. Si el
                      rubro tiene el KPI físico (lo perdido por HL vendido), va
                      ese: se mide contra el target del propio presupuesto del
                      año, en vez de contra el gasto del año anterior. */}
                  {kpiPerd ? (
                    <KpiPerdidasBlock
                      kpi={kpiPerd}
                      rubro={ini.rubro!}
                      ejec={ejec}
                      mesInicio={mesInicio}
                    />
                  ) : kpiComb ? (
                    <KpiCombustibleBlock
                      kpi={kpiComb}
                      unidad={ini.kpi_unidad || "km/l"}
                      lineaBase={ini.kpi_linea_base}
                      objetivo={ini.kpi_objetivo}
                      mesInstalacion={mesInstalacion}
                    />
                  ) : (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                      <span className="text-muted-foreground">
                        {ini.kpi_nombre
                          ? ini.kpi_nombre +
                            (ini.kpi_unidad ? ` (${ini.kpi_unidad})` : "")
                          : "KPI comprometido"}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-slate-900">
                          {formatNum(ini.kpi_linea_base)} →{" "}
                          {formatNum(ini.kpi_objetivo)}
                          {ultimoKpi !== null && (
                            <>
                              <span className="text-muted-foreground">
                                {" "}
                                · hoy{" "}
                              </span>
                              <strong>{formatNum(ultimoKpi)}</strong>
                              {ultimoKpiQ !== null && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  (Q{ultimoKpiQ})
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        <SemaforoBadge frac={kpiFrac} />
                      </span>
                    </div>
                  )}

                  {/* El análisis del último trimestre cargado. */}
                  {ultimoSeg && (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-700">
                        Q{ultimoSeg.trimestre}:
                      </span>{" "}
                      {ultimoSeg.comentario}
                    </p>
                  )}

                  {/* Tira de trimestres */}
                  <div className="grid grid-cols-4 gap-2">
                    {TRIMESTRES.map((q) => {
                      const s = ini.seguimientos.find((x) => x.trimestre === q)
                      const fracQ = s
                        ? cumplimientoKpi(
                            ini.kpi_linea_base,
                            ini.kpi_objetivo,
                            s.kpi_valor,
                            ini.kpi_mejor_si,
                          )
                        : null
                      return (
                        <button
                          key={q}
                          type="button"
                          disabled={!puedeEditar}
                          onClick={() => abrirSeguimiento(ini, q)}
                          className={`rounded-lg border p-2 text-left transition-colors ${
                            puedeEditar
                              ? "hover:border-blue-300 hover:bg-blue-50/40"
                              : ""
                          } ${s ? "border-slate-200 bg-white" : "border-dashed border-slate-200 bg-slate-50/50"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">
                              Q{q}
                            </span>
                            <span
                              className={`size-2 rounded-full ${s ? barColor(fracQ) : "bg-slate-300"}`}
                            />
                          </div>
                          <p className="mt-1 truncate text-xs text-slate-700">
                            KPI: {formatNum(s?.kpi_valor ?? null)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s?.ahorro_real != null
                              ? formatMoney(s.ahorro_real)
                              : "—"}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Diálogos */}
      {puedeEditar && (
        <IniciativaFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          anio={anio}
          iniciativa={editando}
          responsables={responsables}
          onSaved={refrescar}
        />
      )}

      {puedeEditar && seguimientoDe && (
        <SeguimientoIniciativaDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setSeguimientoDe(null)
          }}
          iniciativa={seguimientoDe}
          defaultTrimestre={trimestreInicial}
          onSaved={refrescar}
          onAbrirArchivo={abrirArchivo}
        />
      )}
    </div>
  )
}

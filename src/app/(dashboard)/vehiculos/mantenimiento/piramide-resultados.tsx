"use client"

// Pirámide de mantenimiento y resultados (DPO Flota 4.2 · R4.2.1–R4.2.3).
//
// H1 1/5 — «Generar análisis aperturado de datos históricos. Generar pirámide
// de mantenimientos». Esta solapa es la respuesta completa al punto:
//   1. la pirámide DPO (roturas arriba, preventivo en la base) con su balance;
//   2. los KPIs de resultado (% preventivo, MTBF, MTTR, roturas, aviso previo);
//   3. la evolución mes a mes del año (el «seguimiento en el tiempo»);
//   4. el análisis aperturado por unidad, sistema y taller, con el ANS;
//   5. los planes con herramienta abiertos sobre un foco de la pirámide;
//   6. la lectura mensual firmada;
//   7. los rechazos por rotura que no tienen OT (calidad del dato de la punta).
// Los números salen de `getPiramideFlota` → `construirPiramide` (lib pura).

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChevronDown,
  ChevronRight,
  ClipboardPen,
  FileText,
  Loader2,
  Target,
  TriangleAlert,
  CircleCheck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { PlanHerramientasInline } from "@/components/herramientas-gestion/plan-herramientas-inline"
import {
  abrirPlanPiramide,
  getPiramideFlota,
  guardarRevisionPiramide,
  type PiramideFlotaRespuesta,
} from "@/actions/piramide-flota"
import {
  addFlotaPlanItem,
  cerrarFlotaPlan,
  updateFlotaPlanItem,
} from "@/actions/flota-indicadores"
import {
  NIVELES_PIRAMIDE,
  calcularBalance,
  type ConteoNiveles,
  type FilaApertura,
  type NivelPiramide,
  type OtPiramide,
} from "@/lib/flota/piramide-flota"
import {
  focoDeKpi,
  labelFocoKpi,
  slaDeTaller,
  type FocoPiramide,
  type PlanPiramide,
  type SnapshotRevision,
} from "@/lib/flota/piramide-planes"
import { DpoResponde, DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import { fmtMoneyOt } from "./_components/ot-formato"
import { usePaletaViz } from "./_components/paleta-viz"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]
const META_PREV_CANT = 70

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)
const fmt1 = (v: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v)
const fmtPct = (v: number | null) => (v == null ? "—" : `${fmt1(v)} %`)
const labelYm = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`
const fmtFecha = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y.slice(2)}`
}

const MOTIVO_ROTURA: Record<string, string> = {
  auxilio: "Auxilio en ruta",
  parada: "Parada ≥ 1 día",
  rechazo: "Rechazo por rotura",
}

type Vista = "anio" | `m${number}`
type Eje = "unidad" | "sistema" | "taller"

interface Props {
  puedeEditar: boolean
  /** Abre el detalle de la OT (con sus 5 Porqués) en el diálogo del módulo. */
  onVerOt: (otId: string) => void
}

export function PiramideResultados({ puedeEditar, onVerOt }: Props) {
  const paleta = usePaletaViz()
  const [res, setRes] = useState<PiramideFlotaRespuesta | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [vista, setVista] = useState<Vista>("anio")
  const [eje, setEje] = useState<Eje>("sistema")
  const [abierta, setAbierta] = useState<string | null>(null)
  const [focoPlan, setFocoPlan] = useState<{ foco: FocoPiramide; titulo: string; sugerida: string; valor: number | null } | null>(null)
  const [revisionAbierta, setRevisionAbierta] = useState(false)

  const cargar = useCallback(() => {
    setCargando(true)
    getPiramideFlota().then((r) => {
      if ("error" in r) setError(r.error)
      else {
        setRes(r.data)
        setError(null)
      }
      setCargando(false)
    })
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  const COLOR: Record<NivelPiramide, string> = {
    preventivo: paleta.paradas.preventivo,
    deteccion: paleta.series[3],
    correctivo: paleta.series[1],
    rotura: paleta.critico,
  }

  if (cargando && !res) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Armando la pirámide de mantenimiento…
      </div>
    )
  }
  if (error || !res) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo armar la pirámide: {error}
      </div>
    )
  }

  return (
    <PiramideContenido
      res={res}
      vista={vista}
      setVista={setVista}
      eje={eje}
      setEje={setEje}
      abierta={abierta}
      setAbierta={setAbierta}
      color={COLOR}
      puedeEditar={puedeEditar}
      onVerOt={onVerOt}
      onAbrirPlan={setFocoPlan}
      onRegistrarRevision={() => setRevisionAbierta(true)}
      recargar={cargar}
      cargando={cargando}
      dialogs={
        <>
          <DialogAbrirPlan
            foco={focoPlan}
            onClose={() => setFocoPlan(null)}
            onCreado={() => {
              setFocoPlan(null)
              cargar()
            }}
          />
          <DialogRevision
            abierto={revisionAbierta}
            res={res}
            onClose={() => setRevisionAbierta(false)}
            onGuardada={() => {
              setRevisionAbierta(false)
              cargar()
            }}
          />
        </>
      }
    />
  )
}

// ───────────────────────── contenido ─────────────────────────

function PiramideContenido({
  res,
  vista,
  setVista,
  eje,
  setEje,
  abierta,
  setAbierta,
  color,
  puedeEditar,
  onVerOt,
  onAbrirPlan,
  onRegistrarRevision,
  recargar,
  cargando,
  dialogs,
}: {
  res: PiramideFlotaRespuesta
  vista: Vista
  setVista: (v: Vista) => void
  eje: Eje
  setEje: (e: Eje) => void
  abierta: string | null
  setAbierta: (k: string | null) => void
  color: Record<NivelPiramide, string>
  puedeEditar: boolean
  onVerOt: (id: string) => void
  onAbrirPlan: (f: { foco: FocoPiramide; titulo: string; sugerida: string; valor: number | null }) => void
  onRegistrarRevision: () => void
  recargar: () => void
  cargando: boolean
  dialogs: ReactNode
}) {
  const p = res.piramide
  const mesSel = vista === "anio" ? null : p.porMes.find((m) => Number(m.ym.slice(5, 7)) === Number(vista.slice(1))) ?? null
  const conteo: ConteoNiveles = mesSel ?? p.niveles
  const balance = useMemo(() => calcularBalance(conteo), [conteo])
  const etiqueta = mesSel
    ? `${MESES_LARGO[Number(mesSel.ym.slice(5, 7)) - 1]} ${res.anio}`
    : `${res.anio} acumulado (${fmtFecha(p.desde)} al ${fmtFecha(p.hasta)})`

  const serie = p.porMes.map((m) => ({
    mes: labelYm(m.ym),
    preventivo: m.preventivo,
    deteccion: m.deteccion,
    correctivo: m.correctivo,
    rotura: m.rotura,
    pctPrev: m.pctPreventivoCant == null ? null : Math.round(m.pctPreventivoCant),
  }))

  const filas = eje === "unidad" ? p.porUnidad : p.porSistema
  const k = p.kpis

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">Pirámide de mantenimiento y resultados</h2>
          <DpoSeccionCinta seccionId="piramide" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={vista} onValueChange={(v) => setVista((v as Vista) ?? "anio")}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {(v: string | null) =>
                  !v || v === "anio" ? `${res.anio} · acumulado` : `${MESES_LARGO[Number(v.slice(1)) - 1]} ${res.anio}`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anio">{res.anio} · acumulado</SelectItem>
              {p.porMes.map((m) => (
                <SelectItem key={m.ym} value={`m${Number(m.ym.slice(5, 7))}`}>
                  {MESES_LARGO[Number(m.ym.slice(5, 7)) - 1]} {res.anio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a
            href={`/api/vehiculos/piramide-pdf?anio=${res.anio}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <FileText className="size-4" aria-hidden /> PDF para el auditor
          </a>
          {cargando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {res.sqlPendiente && (
        <p className="rounded-md border border-amber-300 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Falta aplicar <code>APLICAR_EN_PAMPEANA_PIRAMIDE_4_2.sql</code>: la pirámide se calcula igual, pero no se
          pueden registrar lecturas mensuales.
        </p>
      )}

      {/* 1. Pirámide */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Pirámide de flota · {etiqueta}
            <DpoResponde puntos={["4.2"]} requisitos={["R4.2.3"]} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Cada evento cuenta una sola vez, en su nivel más alto. Una pirámide sana tiene más eventos en la base
            (lo planificado) que en cada escalón de arriba, hasta la rotura en la punta.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <PiramideBarras conteo={conteo} color={color} detalle={mesSel ? null : p} />
          {balance.balanceada ? (
            <p className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50/70 p-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CircleCheck className="mt-px size-3.5 shrink-0" />
              <span>
                <strong>Pirámide balanceada:</strong> cada escalón es más angosto que el de abajo.
              </span>
            </p>
          ) : (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>
                <strong>Pirámide desbalanceada:</strong>{" "}
                {balance.inversiones
                  .map(
                    (i) =>
                      `hay más ${tituloNivel(i.arriba).toLowerCase()} (${i.nArriba}) que ${tituloNivel(i.abajo).toLowerCase()} (${i.nAbajo})`
                  )
                  .join("; ")}
                .{" "}
                {balance.inversiones.some((i) => i.arriba === "correctivo")
                  ? "Llega al taller más de lo que el checklist y el CIL detectan antes: hay fallas que no avisan."
                  : balance.inversiones.some((i) => i.abajo === "preventivo")
                    ? "El trabajo planificado no alcanza para sostener lo de arriba."
                    : ""}
              </span>
            </p>
          )}
          {p.detalleDeteccion.checklist === 0 || p.porMes.slice(0, 3).every((m) => m.deteccion === 0) ? (
            <p className="text-[11px] italic text-muted-foreground">
              El checklist digital arrancó en abril de 2026 y el control de aceite del CIL en agosto: los meses
              anteriores no tienen nivel de detección registrado.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 2. KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="% preventivo (OT)"
          valor={fmtPct(k.pctPreventivoCant)}
          estado={k.pctPreventivoCant == null ? "neutro" : k.pctPreventivoCant >= META_PREV_CANT ? "ok" : "alerta"}
          sub={`Preventivas + proactivas sobre el total de OT · meta ≥ ${META_PREV_CANT} %`}
          dpo="4.2"
        />
        <KpiCard
          label="% preventivo ($)"
          valor={fmtPct(k.pctPreventivoCosto)}
          sub="Lo mismo, sobre el costo de las OT"
        />
        <KpiCard
          label="MTBF"
          valor={k.mtbfDias == null ? "—" : `${fmtNum(Math.round(k.mtbfDias))} d`}
          sub={`Días-unidad entre fallas · ${p.unidades} unidades, ${k.fallas} fallas`}
          dpo="4.2"
        />
        <KpiCard
          label="MTTR (mediana)"
          valor={k.mttrMedianaHoras == null ? "—" : `${fmtNum(Math.round(k.mttrMedianaHoras))} h`}
          sub={`Promedio ${k.mttrHoras == null ? "—" : `${fmtNum(Math.round(k.mttrHoras))} h`} · ${k.mttrN} de ${k.fallas} fallas con entrada y salida de taller`}
        />
        <KpiCard
          label="Roturas / mes"
          valor={fmt1(k.roturasPorMes)}
          estado={k.roturasPorMes <= 1 ? "ok" : "critico"}
          sub={`${p.niveles.rotura} en el año · meta ≤ 1/mes (roturas_flota)`}
        />
        <KpiCard
          label="Fallas con aviso"
          valor={fmtPct(k.pctConAviso)}
          estado={k.pctConAviso == null ? "neutro" : k.pctConAviso >= 50 ? "ok" : "alerta"}
          sub="Correctivo o rotura con defecto de checklist / CIL de la unidad en los 15 días previos"
        />
      </div>

      {/* 3. Evolución mensual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Evolución de la pirámide mes a mes
            <DpoResponde puntos={["4.2"]} requisitos={["R4.2.3"]} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Barras: los cuatro niveles de cada mes. Línea: % de OT planificadas (meta {META_PREV_CANT} %). Si la línea
            cae y crecen el naranja y el rojo, el preventivo no está alcanzando.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="n" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {NIVELES_PIRAMIDE.map((n) => (
                  <Bar
                    key={n.key}
                    yAxisId="n"
                    dataKey={n.key}
                    name={n.titulo}
                    stackId="p"
                    fill={color[n.key]}
                    isAnimationActive={false}
                  />
                ))}
                <Line
                  yAxisId="pct"
                  dataKey="pctPrev"
                  name="% OT planificadas"
                  stroke={paletaLinea()}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <ReferenceLine yAxisId="pct" y={META_PREV_CANT} stroke="#888" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Prev.</TableHead>
                  <TableHead className="text-right">Detecc.</TableHead>
                  <TableHead className="text-right">Correct.</TableHead>
                  <TableHead className="text-right">Roturas</TableHead>
                  <TableHead className="text-right">% planif.</TableHead>
                  <TableHead className="text-right">$ preventivo</TableHead>
                  <TableHead className="text-right">$ fallas</TableHead>
                  <TableHead className="text-right">Cumpl. plan MP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.porMes.map((m) => {
                  const cp = res.cumplimientoPlan.find((c) => c.ym === m.ym)?.valor ?? null
                  return (
                    <TableRow key={m.ym}>
                      <TableCell className="whitespace-nowrap">{labelYm(m.ym)}</TableCell>
                      <TableCell className="text-right">{m.preventivo}</TableCell>
                      <TableCell className="text-right">{m.deteccion}</TableCell>
                      <TableCell className="text-right">{m.correctivo}</TableCell>
                      <TableCell className={cn("text-right", m.rotura > 1 && "font-semibold text-destructive")}>
                        {m.rotura}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          m.pctPreventivoCant != null && m.pctPreventivoCant < META_PREV_CANT && "text-amber-600"
                        )}
                      >
                        {fmtPct(m.pctPreventivoCant)}
                      </TableCell>
                      <TableCell className="text-right">{fmtMoneyOt(m.costoPreventivo)}</TableCell>
                      <TableCell className="text-right">{fmtMoneyOt(m.costoCorrectivo + m.costoRotura)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{cp == null ? "—" : `${Math.round(cp)} %`}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 4. Análisis aperturado */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Análisis aperturado del histórico {res.anio}
            <DpoResponde puntos={["4.2"]} requisitos={["R4.2.2"]} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Dónde se concentran las fallas y cuánto cuestan. Ordenado por fallas, correctivo + rotura (Pareto). Desplegá una fila
            para ver sus OT y abrí un plan con herramienta sobre el foco que haya que atacar.
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {(["sistema", "unidad", "taller"] as Eje[]).map((e) => (
              <Button
                key={e}
                size="sm"
                variant={eje === e ? "default" : "outline"}
                onClick={() => {
                  setEje(e)
                  setAbierta(null)
                }}
              >
                Por {e}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {eje === "taller" ? (
            <TablaTalleres res={res} abierta={abierta} setAbierta={setAbierta} onVerOt={onVerOt} puedeEditar={puedeEditar} onAbrirPlan={onAbrirPlan} />
          ) : (
            <TablaApertura
              filas={filas}
              eje={eje}
              abierta={abierta}
              setAbierta={setAbierta}
              onVerOt={onVerOt}
              puedeEditar={puedeEditar}
              onAbrirPlan={onAbrirPlan}
              color={color}
            />
          )}
        </CardContent>
      </Card>

      {/* 5. Planes */}
      <PlanesPiramide res={res} puedeEditar={puedeEditar} recargar={recargar} />

      {/* 6. Lectura mensual */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                Lectura mensual de la pirámide
                <DpoResponde puntos={["4.2"]} requisitos={["R4.2.3"]} />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                SOP 4.2 §7.1: al cierre de cada mes se lee la pirámide, se decide qué atacar y queda registrado con la
                foto de los números.
              </p>
            </div>
            {puedeEditar && !res.sqlPendiente && (
              <Button size="sm" onClick={onRegistrarRevision}>
                <ClipboardPen className="size-4" /> Registrar lectura
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {res.revisiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay lecturas registradas en {res.anio}.</p>
          ) : (
            <div className="space-y-2">
              {res.revisiones.map((r) => (
                <div key={r.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="capitalize">
                      {MESES_LARGO[r.mes - 1]} {r.anio}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {r.revisadoPor ?? "—"} · {fmtFecha(r.revisadoAt)}
                    </span>
                  </div>
                  {r.snapshot?.mes && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mes: {r.snapshot.mes.preventivo} prev · {r.snapshot.mes.deteccion} detecc. ·{" "}
                      {r.snapshot.mes.correctivo} correct. · {r.snapshot.mes.rotura} roturas ·{" "}
                      {r.snapshot.balance?.balanceada ? "balanceada" : "desbalanceada"} · % planif.{" "}
                      {fmtPct(r.snapshot.kpis?.pctPreventivoCant ?? null)}
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-line">{r.lectura}</p>
                  {r.decision && (
                    <p className="mt-1 whitespace-pre-line text-muted-foreground">
                      <strong className="text-foreground">Decisión:</strong> {r.decision}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {dialogs}
    </div>
  )
}

function paletaLinea(): string {
  return "#4a3aa7"
}

function tituloNivel(n: NivelPiramide): string {
  return NIVELES_PIRAMIDE.find((x) => x.key === n)?.titulo ?? n
}

// ───────────────────────── pirámide en barras ─────────────────────────

function PiramideBarras({
  conteo,
  color,
  detalle,
}: {
  conteo: ConteoNiveles
  color: Record<NivelPiramide, string>
  detalle: PiramideFlotaRespuesta["piramide"] | null
}) {
  const orden = [...NIVELES_PIRAMIDE].reverse() // punta arriba
  const costo: Record<NivelPiramide, number | null> = {
    rotura: conteo.costoRotura,
    correctivo: conteo.costoCorrectivo,
    deteccion: null,
    preventivo: conteo.costoPreventivo,
  }
  const sub: Partial<Record<NivelPiramide, string>> = detalle
    ? {
        rotura: `${detalle.detalleRotura.parada} parada ≥ 1 d · ${detalle.detalleRotura.auxilio} auxilio · ${detalle.detalleRotura.rechazo} con rechazo`,
        deteccion: `${detalle.detalleDeteccion.checklist} focos de checklist (${detalle.detalleDeteccion.criticos} críticos) · ${detalle.detalleDeteccion.cil} hallazgos CIL`,
      }
    : {}
  // Triángulo partido en franjas de igual alto: la forma es fija (punta arriba) y
  // el número va adentro de cada franja. Cada franja es un trapecio recortado con
  // clip-path; la de arriba arranca en 0 de ancho, así cierra en punta.
  const total = orden.length
  return (
    <div className="space-y-[3px]">
      {orden.map((n, i) => {
        const v = conteo[n.key]
        const abajo = orden[i + 1]
        const vAbajo = abajo ? conteo[abajo.key] : 0
        const arriba = (50 * i) / total // semiancho (%) del borde superior
        const base = (50 * (i + 1)) / total // semiancho (%) del borde inferior
        const clip = `polygon(${50 - arriba}% 0, ${50 + arriba}% 0, ${50 + base}% 100%, ${50 - base}% 100%)`
        const extra = (
          <>
            {costo[n.key] != null && <span>{fmtMoneyOt(costo[n.key] ?? 0)}</span>}
            {abajo && v > 0 && vAbajo > 0 && <span className="ml-2">· 1 cada {fmt1(vAbajo / v)}</span>}
          </>
        )
        return (
          <div key={n.key} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-2 sm:grid-cols-[13rem_1fr_9rem]">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold" style={{ color: color[n.key] }}>
                {n.titulo}
              </p>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{sub[n.key] ?? n.detalle}</p>
              {/* En celu el costo va acá: una fila aparte cortaría el triángulo. */}
              <p className="text-[11px] text-muted-foreground sm:hidden">{extra}</p>
            </div>
            <div
              className={`flex h-14 justify-center text-sm font-bold text-white ${i === 0 ? "items-end pb-1.5" : "items-center"}`}
              style={{ clipPath: clip, background: color[n.key] }}
              title={`${n.titulo}: ${v}`}
            >
              {fmtNum(v)}
            </div>
            <div className="hidden text-right text-[11px] text-muted-foreground sm:block">{extra}</div>
          </div>
        )
      })}
    </div>
  )
}

// ───────────────────────── aperturas ─────────────────────────

function TablaOtsPiramide({ ots, onVerOt, color }: { ots: OtPiramide[]; onVerOt: (id: string) => void; color: Record<NivelPiramide, string> }) {
  const fallas = ots.filter((o) => o.nivel !== "preventivo")
  const lista = fallas.length > 0 ? fallas : ots
  return (
    <div className="space-y-1 py-1">
      {fallas.length === 0 && <p className="text-xs text-muted-foreground">Sin fallas: sólo trabajo planificado.</p>}
      {lista.slice(0, 30).map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onVerOt(o.id)}
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: color[o.nivel] }} />
          <span className="w-16 shrink-0">{fmtFecha(o.fecha)}</span>
          <span className="w-16 shrink-0 font-medium">{o.dominio}</span>
          <span className="w-12 shrink-0 text-muted-foreground">OT {o.numeroOt ?? "—"}</span>
          <span className="min-w-0 flex-1 truncate">{o.descripcion || "—"}</span>
          {o.motivoRotura && <Badge variant="destructive">{MOTIVO_ROTURA[o.motivoRotura]}</Badge>}
          {o.diasParado > 0 && <span className="text-muted-foreground">{o.diasParado} d parado</span>}
          <span className="text-muted-foreground">{fmtMoneyOt(o.costo)}</span>
        </button>
      ))}
      {lista.length > 30 && <p className="text-xs text-muted-foreground">… y {lista.length - 30} más.</p>}
    </div>
  )
}

function TablaApertura({
  filas,
  eje,
  abierta,
  setAbierta,
  onVerOt,
  puedeEditar,
  onAbrirPlan,
  color,
}: {
  filas: FilaApertura[]
  eje: "unidad" | "sistema"
  abierta: string | null
  setAbierta: (k: string | null) => void
  onVerOt: (id: string) => void
  puedeEditar: boolean
  onAbrirPlan: (f: { foco: FocoPiramide; titulo: string; sugerida: string; valor: number | null }) => void
  color: Record<NivelPiramide, string>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-6" />
          <TableHead>{eje === "unidad" ? "Unidad" : "Sistema"}</TableHead>
          <TableHead className="text-right">Prev.</TableHead>
          <TableHead className="text-right">Detecc.</TableHead>
          <TableHead className="text-right">Correct.</TableHead>
          <TableHead className="text-right">Roturas</TableHead>
          <TableHead className="text-right">Días parado</TableHead>
          <TableHead className="text-right">$ fallas</TableHead>
          <TableHead className="text-right">% fallas</TableHead>
          {puedeEditar && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => {
          const open = abierta === f.clave
          const fallas = f.correctivo + f.rotura
          const desbalance = fallas > f.preventivo && fallas > 0
          return (
            <Fragment key={f.clave}>
              <TableRow className="cursor-pointer" onClick={() => setAbierta(open ? null : f.clave)}>
                <TableCell>{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                <TableCell className="font-medium">
                  {f.label}
                  {desbalance && (
                    <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700 dark:text-amber-300">
                      más fallas que preventivo
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{f.preventivo}</TableCell>
                <TableCell className="text-right">{f.deteccion}</TableCell>
                <TableCell className="text-right">{f.correctivo}</TableCell>
                <TableCell className={cn("text-right", f.rotura > 0 && "font-semibold text-destructive")}>{f.rotura}</TableCell>
                <TableCell className="text-right">{f.diasParado}</TableCell>
                <TableCell className="text-right">{fmtMoneyOt(f.costoCorrectivo + f.costoRotura)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt1(f.pctFallas)} %</TableCell>
                {puedeEditar && (
                  <TableCell className="text-right">
                    {fallas > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          onAbrirPlan({
                            foco: { tipo: eje, valor: f.clave },
                            titulo: eje === "unidad" ? `Unidad ${f.label}` : `Sistema ${f.label}`,
                            sugerida: `${eje === "unidad" ? `La unidad ${f.label}` : `El sistema ${f.label}`} acumula ${f.correctivo} correctivo(s) y ${f.rotura} rotura(s) en el año (${fmtMoneyOt(f.costoCorrectivo + f.costoRotura)}, ${f.diasParado} días parado) contra ${f.preventivo} preventivo(s) y ${f.deteccion} detección(es) previas. `,
                            valor: fallas,
                          })
                        }}
                      >
                        <Target className="size-4" /> Plan
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
              {open && (
                <TableRow>
                  <TableCell />
                  <TableCell colSpan={puedeEditar ? 9 : 8}>
                    <TablaOtsPiramide ots={f.ots} onVerOt={onVerOt} color={color} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function TablaTalleres({
  res,
  abierta,
  setAbierta,
  onVerOt,
  puedeEditar,
  onAbrirPlan,
}: {
  res: PiramideFlotaRespuesta
  abierta: string | null
  setAbierta: (k: string | null) => void
  onVerOt: (id: string) => void
  puedeEditar: boolean
  onAbrirPlan: (f: { foco: FocoPiramide; titulo: string; sugerida: string; valor: number | null }) => void
}) {
  const talleres = res.piramide.talleres.filter((t) => t.correctivas > 0 || t.ots >= 3)
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        Lo que se le mide a un taller en un ANS: días parado por reparación, horas de taller (entrada → salida) y
        retrabajo (la misma unidad vuelve por el mismo sistema en ≤ 90 días). Talleres con correctivas o con 3+ OT.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6" />
            <TableHead>Taller</TableHead>
            <TableHead>ANS</TableHead>
            <TableHead className="text-right">OT</TableHead>
            <TableHead className="text-right">Correct.</TableHead>
            <TableHead className="text-right">Roturas</TableHead>
            <TableHead className="text-right">Días parado prom.</TableHead>
            <TableHead className="text-right">Hs taller prom.</TableHead>
            <TableHead className="text-right">Retrabajo</TableHead>
            <TableHead className="text-right">Costo</TableHead>
            {puedeEditar && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {talleres.map((t) => {
            const sla = t.interna ? null : slaDeTaller(res.slas, t.taller)
            const open = abierta === t.taller
            return (
              <Fragment key={t.taller}>
                <TableRow className="cursor-pointer" onClick={() => setAbierta(open ? null : t.taller)}>
                  <TableCell>{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                  <TableCell className="max-w-64 truncate font-medium">{t.taller}</TableCell>
                  <TableCell>
                    {t.interna ? (
                      <span className="text-xs text-muted-foreground">interno</span>
                    ) : sla ? (
                      <Badge variant={sla.estado === "firmado" ? "default" : "outline"}>
                        {sla.estado === "firmado" ? "Firmado" : "Pendiente"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-amber-600">Sin ANS</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{t.ots}</TableCell>
                  <TableCell className="text-right">{t.correctivas}</TableCell>
                  <TableCell className={cn("text-right", t.roturas > 0 && "text-destructive")}>{t.roturas}</TableCell>
                  <TableCell className="text-right">{t.diasParadoProm == null ? "—" : fmt1(t.diasParadoProm)}</TableCell>
                  <TableCell className="text-right">
                    {t.horasTallerProm == null ? "—" : `${fmtNum(Math.round(t.horasTallerProm))} h`}
                    <span className="text-muted-foreground"> ({t.conHoras})</span>
                  </TableCell>
                  <TableCell className={cn("text-right", (t.pctRetrabajo ?? 0) >= 20 && "text-amber-600")}>
                    {t.retrabajos} {t.pctRetrabajo == null ? "" : `(${Math.round(t.pctRetrabajo)} %)`}
                  </TableCell>
                  <TableCell className="text-right">{fmtMoneyOt(t.costo)}</TableCell>
                  {puedeEditar && (
                    <TableCell className="text-right">
                      {!t.interna && t.correctivas > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            onAbrirPlan({
                              foco: { tipo: "taller", valor: t.taller },
                              titulo: `Taller ${t.taller}`,
                              sugerida: `Taller ${t.taller}: ${t.correctivas} correctiva(s) en el año, ${t.diasParadoProm == null ? "—" : fmt1(t.diasParadoProm)} días parado promedio, ${t.retrabajos} retrabajo(s). ANS: ${sla ? sla.estado : "no hay"}. `,
                              valor: t.correctivas,
                            })
                          }}
                        >
                          <Target className="size-4" /> Plan
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
                {open && (
                  <TableRow>
                    <TableCell />
                    <TableCell colSpan={puedeEditar ? 10 : 9}>
                      {t.retrabajoOts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin retrabajos detectados.</p>
                      ) : (
                        <div className="space-y-1 py-1">
                          <p className="text-xs font-medium">Retrabajos (volvió la misma unidad por el mismo sistema):</p>
                          {t.retrabajoOts.map(({ origen, vuelta }) => (
                            <div key={origen.id + vuelta.id} className="flex flex-wrap gap-x-2 text-xs">
                              <button type="button" className="underline-offset-2 hover:underline" onClick={() => onVerOt(origen.id)}>
                                OT {origen.numeroOt ?? "—"} {fmtFecha(origen.fecha)}
                              </button>
                              <span>→</span>
                              <button type="button" className="underline-offset-2 hover:underline" onClick={() => onVerOt(vuelta.id)}>
                                OT {vuelta.numeroOt ?? "—"} {fmtFecha(vuelta.fecha)}
                              </button>
                              <span className="text-muted-foreground">
                                {origen.dominio} · {origen.descripcion.slice(0, 70)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </>
  )
}

// ───────────────────────── planes ─────────────────────────

function PlanesPiramide({ res, puedeEditar, recargar }: { res: PiramideFlotaRespuesta; puedeEditar: boolean; recargar: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Planes sobre la pirámide ({res.planes.length})
          <DpoResponde puntos={["4.2"]} requisitos={["R4.2.2", "R4.2.3"]} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Cada plan ataca un foco (sistema, unidad o taller) con una herramienta de gestión (5 Porqués, Causa-Efecto o
          PDCA). El efecto se mide con las fallas del foco antes y después de abrir el plan. Si la contramedida es una
          tarea nueva del plan preventivo, cargala desde Plan/Plantillas con «Llevar al plan».
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {res.planes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay planes. Abrilos desde el análisis aperturado con el botón «Plan» de cada fila.
          </p>
        )}
        {res.planes.map((pl) => (
          <PlanFila
            key={pl.id}
            plan={pl}
            res={res}
            abierto={abierto === pl.id}
            onToggle={() => setAbierto(abierto === pl.id ? null : pl.id)}
            puedeEditar={puedeEditar}
            recargar={recargar}
          />
        ))}
      </CardContent>
    </Card>
  )
}

const LABEL_HERR: Record<string, string> = {
  cinco_porques: "5 Porqués",
  causa_efecto: "Causa-Efecto",
  pdca: "PDCA",
}

/** Fallas del foco por mes antes y después de abrir el plan (misma cantidad de meses). */
function efectoPlan(plan: PlanPiramide, res: PiramideFlotaRespuesta): { antes: number; despues: number; meses: number } | null {
  const foco = focoDeKpi(plan.kpi)
  if (!foco) return null
  const ots = res.piramide.ots.filter(
    (o) =>
      o.nivel !== "preventivo" &&
      ((foco.tipo === "sistema" && o.sistema === foco.valor) ||
        (foco.tipo === "unidad" && o.dominio === foco.valor) ||
        (foco.tipo === "taller" && o.taller === foco.valor))
  )
  const inicio = plan.createdAt.slice(0, 10)
  const hoy = res.piramide.hasta
  const mesesDespues = Math.max(
    1,
    (Number(hoy.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 + Number(hoy.slice(5, 7)) - Number(inicio.slice(5, 7)) + 1
  )
  const d = new Date(inicio + "T12:00:00Z")
  d.setUTCMonth(d.getUTCMonth() - mesesDespues)
  const desdeAntes = d.toISOString().slice(0, 10)
  return {
    antes: ots.filter((o) => o.fecha >= desdeAntes && o.fecha < inicio).length,
    despues: ots.filter((o) => o.fecha >= inicio).length,
    meses: mesesDespues,
  }
}

function PlanFila({
  plan,
  res,
  abierto,
  onToggle,
  puedeEditar,
  recargar,
}: {
  plan: PlanPiramide
  res: PiramideFlotaRespuesta
  abierto: boolean
  onToggle: () => void
  puedeEditar: boolean
  recargar: () => void
}) {
  const [pending, start] = useTransition()
  const [accion, setAccion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fecha, setFecha] = useState("")
  const [cierre, setCierre] = useState("")
  const efecto = efectoPlan(plan, res)
  const hechos = plan.items.filter((i) => i.estado === "completado").length

  const agregar = () =>
    start(async () => {
      const r = await addFlotaPlanItem({ planId: plan.id, accion, responsable, fechaCompromiso: fecha })
      if ("error" in r) toast.error(r.error)
      else {
        setAccion("")
        setResponsable("")
        setFecha("")
        recargar()
      }
    })
  const cambiarEstado = (id: string, estado: "pendiente" | "en_progreso" | "completado") =>
    start(async () => {
      const r = await updateFlotaPlanItem({ id, estado })
      if ("error" in r) toast.error(r.error)
      else recargar()
    })
  const cerrar = () =>
    start(async () => {
      const r = await cerrarFlotaPlan(plan.id, cierre)
      if ("error" in r) toast.error(r.error)
      else {
        toast.success("Plan cerrado")
        recargar()
      }
    })

  return (
    <div className="rounded-md border">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-2 p-3 text-left text-sm">
        {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <strong className="min-w-0 flex-1">{labelFocoKpi(plan.kpi)}</strong>
        <Badge variant={plan.estado === "cerrado" ? "default" : "outline"}>{plan.estado.replace("_", " ")}</Badge>
        <span className="text-xs text-muted-foreground">
          {hechos}/{plan.items.length} acciones
        </span>
        {plan.herramientas.length > 0 ? (
          <Badge variant="secondary">{plan.herramientas.map((h) => LABEL_HERR[h] ?? h).join(" + ")}</Badge>
        ) : (
          <span className="text-xs text-amber-600">sin herramienta</span>
        )}
        {efecto && (
          <span className="text-xs text-muted-foreground">
            fallas: {efecto.antes} antes → {efecto.despues} después ({efecto.meses} m)
          </span>
        )}
      </button>
      {abierto && (
        <div className="space-y-3 border-t p-3 text-sm">
          <p className="whitespace-pre-line">
            <strong>Problema / causa:</strong> {plan.causaRaiz}
          </p>
          <div className="space-y-1">
            {plan.items.length === 0 && <p className="text-xs text-muted-foreground">Sin acciones cargadas.</p>}
            {plan.items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn("min-w-0 flex-1", it.estado === "completado" && "line-through text-muted-foreground")}>
                  {it.accion}
                </span>
                <span className="text-muted-foreground">
                  {it.responsable} · {fmtFecha(it.fecha_compromiso)}
                </span>
                {puedeEditar && plan.estado !== "cerrado" ? (
                  <Select value={it.estado} onValueChange={(v) => v && cambiarEstado(it.id, v as typeof it.estado)}>
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue>
                        {(v: string | null) =>
                          v === "completado" ? "Completado" : v === "en_progreso" ? "En progreso" : "Pendiente"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="en_progreso">En progreso</SelectItem>
                      <SelectItem value="completado">Completado</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{it.estado.replace("_", " ")}</Badge>
                )}
              </div>
            ))}
          </div>
          {puedeEditar && plan.estado !== "cerrado" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]">
              <Input placeholder="Nueva acción (contramedida)" value={accion} onChange={(e) => setAccion(e.target.value)} />
              <Input placeholder="Responsable" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <Button size="sm" disabled={pending || !accion.trim() || !responsable.trim() || !fecha} onClick={agregar}>
                Agregar
              </Button>
            </div>
          )}
          <PlanHerramientasInline
            flotaPlanId={plan.id}
            tituloSugerido={labelFocoKpi(plan.kpi)}
            puedeAplicar={puedeEditar}
            onSaved={recargar}
          />
          {plan.estado === "cerrado" ? (
            <p className="text-xs">
              <strong>Resultado:</strong> {plan.resultadoCierre ?? "—"} ({plan.fechaCierre ? fmtFecha(plan.fechaCierre) : "—"})
            </p>
          ) : (
            puedeEditar && (
              <div className="flex flex-wrap gap-2">
                <Input
                  className="min-w-0 flex-1"
                  placeholder="Resultado verificado al cerrar (qué cambió en la pirámide, qué se estandarizó)"
                  value={cierre}
                  onChange={(e) => setCierre(e.target.value)}
                />
                <Button size="sm" variant="outline" disabled={pending || cierre.trim().length < 10} onClick={cerrar}>
                  Cerrar plan
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── diálogos ─────────────────────────

function DialogAbrirPlan({
  foco,
  onClose,
  onCreado,
}: {
  foco: { foco: FocoPiramide; titulo: string; sugerida: string; valor: number | null } | null
  onClose: () => void
  onCreado: () => void
}) {
  const [causa, setCausa] = useState("")
  const [accion, setAccion] = useState("")
  const [responsable, setResponsable] = useState("")
  const [fecha, setFecha] = useState("")
  const [pending, start] = useTransition()
  useEffect(() => {
    if (foco) {
      setCausa(foco.sugerida)
      setAccion("")
      setResponsable("")
      setFecha("")
    }
  }, [foco])
  const guardar = () =>
    start(async () => {
      if (!foco) return
      const r = await abrirPlanPiramide({
        foco: foco.foco,
        causaRaiz: causa,
        valorMes: foco.valor,
        primeraAccion: accion.trim() ? { accion, responsable, fechaCompromiso: fecha } : null,
      })
      if ("error" in r) toast.error(r.error)
      else {
        toast.success(r.data.existente ? "Ya había un plan de este foco este mes: se abre ese." : "Plan abierto")
        onCreado()
      }
    })
  return (
    <Dialog open={!!foco} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir plan · {foco?.titulo}</DialogTitle>
          <DialogDescription>
            Queda en los planes de la pirámide y en Indicadores. Después aplicá la herramienta (5 Porqués, Causa-Efecto o
            PDCA) desde el plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Problema a atacar (con los números)</Label>
            <Textarea rows={4} value={causa} onChange={(e) => setCausa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Primera acción (opcional)</Label>
            <Input value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="Ej.: 5 Porqués sobre la OT más cara del foco" />
          </div>
          {accion.trim() && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Responsable" />
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={pending || causa.trim().length < 10 || (!!accion.trim() && (!responsable.trim() || !fecha))}
            onClick={guardar}
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Abrir plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogRevision({
  abierto,
  res,
  onClose,
  onGuardada,
}: {
  abierto: boolean
  res: PiramideFlotaRespuesta
  onClose: () => void
  onGuardada: () => void
}) {
  const p = res.piramide
  // Por defecto, el último mes cerrado.
  const mesDefault = useMemo(() => {
    const actual = Number(p.hasta.slice(5, 7))
    return Number(p.hasta.slice(0, 4)) === res.anio && actual > 1 ? actual - 1 : actual
  }, [p.hasta, res.anio])
  const [mes, setMes] = useState(String(mesDefault))
  const [lectura, setLectura] = useState("")
  const [decision, setDecision] = useState("")
  const [pending, start] = useTransition()
  const m = p.porMes.find((x) => Number(x.ym.slice(5, 7)) === Number(mes))
  const existente = res.revisiones.find((r) => r.mes === Number(mes))
  useEffect(() => {
    if (abierto) {
      setLectura(existente?.lectura ?? "")
      setDecision(existente?.decision ?? "")
    }
  }, [abierto, existente])

  const guardar = () =>
    start(async () => {
      if (!m) return
      const snapshot: SnapshotRevision = {
        mes: {
          preventivo: m.preventivo,
          deteccion: m.deteccion,
          correctivo: m.correctivo,
          rotura: m.rotura,
          costoPreventivo: m.costoPreventivo,
          costoFallas: m.costoCorrectivo + m.costoRotura,
        },
        acumulado: {
          preventivo: p.niveles.preventivo,
          deteccion: p.niveles.deteccion,
          correctivo: p.niveles.correctivo,
          rotura: p.niveles.rotura,
        },
        kpis: {
          pctPreventivoCant: m.pctPreventivoCant,
          pctPreventivoCosto: p.kpis.pctPreventivoCosto,
          mtbfDias: p.kpis.mtbfDias,
          mttrHoras: p.kpis.mttrHoras,
          pctConAviso: p.kpis.pctConAviso,
        },
        balance: { balanceada: calcularBalance(m).balanceada },
      }
      const r = await guardarRevisionPiramide({ anio: res.anio, mes: Number(mes), lectura, decision, snapshot })
      if ("error" in r) toast.error(r.error)
      else {
        toast.success("Lectura registrada")
        onGuardada()
      }
    })

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lectura mensual de la pirámide</DialogTitle>
          <DialogDescription>Qué dice la pirámide del mes y qué se decide hacer. Queda con la foto de los números.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Mes</Label>
            <Select value={mes} onValueChange={(v) => v && setMes(v)}>
              <SelectTrigger className="w-44">
                <SelectValue>
                  {(v: string | null) => (v ? `${MESES_LARGO[Number(v) - 1]} ${res.anio}` : "")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {p.porMes.map((x) => (
                  <SelectItem key={x.ym} value={String(Number(x.ym.slice(5, 7)))}>
                    {MESES_LARGO[Number(x.ym.slice(5, 7)) - 1]} {res.anio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {m && (
            <p className="rounded-md bg-muted p-2 text-xs">
              {m.preventivo} preventivo · {m.deteccion} detección · {m.correctivo} correctivo · {m.rotura} roturas · %
              planificado {fmtPct(m.pctPreventivoCant)} · {calcularBalance(m).balanceada ? "balanceada" : "desbalanceada"}
              {existente && " · ya tiene lectura: se va a reemplazar"}
            </p>
          )}
          <div className="space-y-1">
            <Label>Lectura</Label>
            <Textarea
              rows={4}
              value={lectura}
              onChange={(e) => setLectura(e.target.value)}
              placeholder="Ej.: el % planificado cayó a 29 % porque no se hicieron services en agosto; 14 correctivos, 8 de luces y lona en 3 unidades…"
            />
          </div>
          <div className="space-y-1">
            <Label>Decisión</Label>
            <Textarea
              rows={3}
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="Ej.: abrir PDCA de carrocería/lona y sumar la tarea de inspección cada 20.000 km al plan preventivo."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || lectura.trim().length < 20 || !m} onClick={guardar}>
            {pending && <Loader2 className="size-4 animate-spin" />} Guardar lectura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

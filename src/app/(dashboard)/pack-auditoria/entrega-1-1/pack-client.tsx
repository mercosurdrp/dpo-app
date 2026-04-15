"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Printer,
  FileText,
  ExternalLink,
  ClipboardCheck,
  Users,
  Target,
  Clock,
  ShieldCheck,
  Download,
} from "lucide-react"
import type { PackAuditoria11 } from "@/actions/pack-auditoria"
import { getDownloadUrl } from "@/actions/dpo-evidencia"
import type { DpoArchivo } from "@/types/database"

const MESES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function EstadoIcono({ estado }: { estado: "cumple" | "parcial" | "no_cumple" }) {
  if (estado === "cumple") return <CheckCircle2 className="h-5 w-5 text-green-600" />
  if (estado === "parcial") return <AlertTriangle className="h-5 w-5 text-amber-600" />
  return <XCircle className="h-5 w-5 text-red-600" />
}

function EstadoBadge({ estado }: { estado: "cumple" | "parcial" | "no_cumple" }) {
  if (estado === "cumple")
    return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Cumple</Badge>
  if (estado === "parcial")
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Parcial</Badge>
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">No cumple</Badge>
}

interface Props {
  pack: PackAuditoria11
  archivos: DpoArchivo[]
}

export function PackAuditoria11Client({ pack, archivos }: Props) {
  const fechaGen = new Date(pack.generado_en).toLocaleString("es-AR")

  const tmlMensualChart = pack.r1_1_5_tml.mensual.map((m) => ({
    name: `${MESES[m.mes]} ${String(m.year).slice(2)}`,
    tml: m.promedio_tml,
    pct: m.pct_dentro_meta,
  }))

  const yoyChart = pack.r1_1_5_tml.comparado_yoy.map((c) => ({
    name: c.mes_label,
    actual: c.promedio_tml_actual,
    anterior: c.promedio_tml_anterior,
  }))

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header del pack */}
      <div className="flex flex-col gap-4 rounded-lg border bg-white p-6 shadow-sm print:shadow-none md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-blue-100 p-3">
            <ShieldCheck className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pack de Auditoría DPO 2.0
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              Pilar {pack.pilar} — Punto {pack.punto}: {pack.titulo}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generado el {fechaGen} · Mercosur Región Pampeana
            </p>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Score estimado */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score estimado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-4">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold ${
                pack.score_estimado.valor === 5
                  ? "bg-green-100 text-green-700"
                  : pack.score_estimado.valor >= 3
                  ? "bg-amber-100 text-amber-700"
                  : pack.score_estimado.valor >= 1
                  ? "bg-orange-100 text-orange-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {pack.score_estimado.valor}
            </div>
            <div>
              <p className="text-lg font-semibold">{pack.score_estimado.texto}</p>
              <p className="text-sm text-muted-foreground">
                Evaluación automática según cumplimiento de R1.1.1 a R1.1.5
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {pack.score_estimado.requisitos.map((req) => (
              <div
                key={req.codigo}
                className="flex items-start gap-3 rounded-md border bg-slate-50 p-3"
              >
                <EstadoIcono estado={req.estado} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {req.codigo}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{req.descripcion}</span>
                    <EstadoBadge estado={req.estado} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{req.evidencia}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* R1.1.1 SOP */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">R1.1.1 — SOP Pre-Ruta actualizado</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Última revisión: {pack.r1_1_1_sop.ultima_revision}
            </p>
          </div>
          <FileText className="h-5 w-5 text-slate-400" />
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <span className="font-medium">Archivo:</span> {pack.r1_1_1_sop.archivo}
          </p>
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Secciones clave del procedimiento
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {pack.r1_1_1_sop.secciones_clave.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* R1.1.2 OWD */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">
              R1.1.2 — Ejecución del proceso (OWD Pre-Ruta)
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Observación en el puesto de trabajo
            </p>
          </div>
          <Link
            href="/indicadores/owd-pre-ruta"
            className="text-xs text-blue-600 hover:underline print:hidden"
          >
            <ExternalLink className="inline h-3 w-3" /> Ver módulo
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Total observaciones</p>
              <p className="text-2xl font-bold">{pack.r1_1_2_ejecucion.owd_total_observaciones}</p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">% Cumplimiento promedio</p>
              <p
                className={`text-2xl font-bold ${
                  pack.r1_1_2_ejecucion.owd_promedio_cumplimiento >= 90
                    ? "text-green-600"
                    : pack.r1_1_2_ejecucion.owd_promedio_cumplimiento >= 75
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {pack.r1_1_2_ejecucion.owd_promedio_cumplimiento.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Obs. del mes</p>
              <p className="text-2xl font-bold">{pack.r1_1_2_ejecucion.owd_obs_mes_actual}</p>
            </div>
          </div>
          {pack.r1_1_2_ejecucion.owd_por_etapa.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cumplimiento por etapa del SOP
              </p>
              <div className="space-y-1">
                {pack.r1_1_2_ejecucion.owd_por_etapa.map((e) => (
                  <div key={e.etapa} className="flex items-center gap-3">
                    <span className="w-48 text-sm">{e.etapa}</span>
                    <div className="flex-1 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${
                          e.pct >= 90 ? "bg-green-500" : e.pct >= 75 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${e.pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-xs">{e.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {pack.r1_1_2_ejecucion.owd_items_fallados.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Top 5 ítems con desvíos
              </p>
              <div className="space-y-1">
                {pack.r1_1_2_ejecucion.owd_items_fallados.map((i) => (
                  <div
                    key={i.item_id}
                    className="flex items-center justify-between rounded-md border bg-slate-50 p-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase text-slate-500">{i.etapa}</p>
                      <p className="font-medium">{i.texto}</p>
                    </div>
                    <Badge variant="outline" className="ml-2">{i.total_nook} NO OK</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* R1.1.3 SKAP */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">R1.1.3 — Equipos capacitados en SOP</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Matriz SKAP de certificación
            </p>
          </div>
          <Link
            href="/capacitaciones/matriz-skap"
            className="text-xs text-blue-600 hover:underline print:hidden"
          >
            <ExternalLink className="inline h-3 w-3" /> Ver matriz
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-5">
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Cobertura</p>
              <p
                className={`text-2xl font-bold ${
                  pack.r1_1_3_capacitacion.matriz.pct_cobertura >= 90
                    ? "text-green-600"
                    : pack.r1_1_3_capacitacion.matriz.pct_cobertura >= 70
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {pack.r1_1_3_capacitacion.matriz.pct_cobertura.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-md border bg-green-50 p-3">
              <p className="text-xs text-muted-foreground">Vigentes</p>
              <p className="text-2xl font-bold text-green-700">
                {pack.r1_1_3_capacitacion.matriz.vigentes}
              </p>
            </div>
            <div className="rounded-md border bg-amber-50 p-3">
              <p className="text-xs text-muted-foreground">Por vencer</p>
              <p className="text-2xl font-bold text-amber-700">
                {pack.r1_1_3_capacitacion.matriz.por_vencer}
              </p>
            </div>
            <div className="rounded-md border bg-red-50 p-3">
              <p className="text-xs text-muted-foreground">Vencidas</p>
              <p className="text-2xl font-bold text-red-700">
                {pack.r1_1_3_capacitacion.matriz.vencidas}
              </p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Sin certificar</p>
              <p className="text-2xl font-bold text-slate-700">
                {pack.r1_1_3_capacitacion.matriz.sin_certificar}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Total empleados: {pack.r1_1_3_capacitacion.matriz.total_empleados} · Meta ≥ 90%
          </p>
        </CardContent>
      </Card>

      {/* R1.1.4 Planes */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">R1.1.4 — Planes de acción TML</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Planes cargados para meses fuera de meta
            </p>
          </div>
          <Link
            href="/indicadores/tml"
            className="text-xs text-blue-600 hover:underline print:hidden"
          >
            <ExternalLink className="inline h-3 w-3" /> Ver módulo
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Meses fuera meta</p>
              <p className="text-2xl font-bold">{pack.r1_1_4_planes.total_meses_fuera_meta}</p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Con plan cargado</p>
              <p className="text-2xl font-bold">{pack.r1_1_4_planes.meses_con_plan}</p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">% con plan</p>
              <p
                className={`text-2xl font-bold ${
                  pack.r1_1_4_planes.pct_con_plan === 100
                    ? "text-green-600"
                    : pack.r1_1_4_planes.pct_con_plan >= 50
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {pack.r1_1_4_planes.pct_con_plan}%
              </p>
            </div>
          </div>
          {pack.r1_1_4_planes.total_meses_fuera_meta > 0 && (
            <div className="mt-3 space-y-1">
              {pack.r1_1_4_planes.resumen
                .filter((r) => r.fuera_meta)
                .slice(0, 6)
                .map((r) => (
                  <div
                    key={`${r.year}-${r.mes}`}
                    className={`flex items-center justify-between rounded-md border p-2 text-sm ${
                      r.plan
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-red-200 bg-red-50/40"
                    }`}
                  >
                    <span className="font-medium">
                      {MESES[r.mes]} {r.year}
                    </span>
                    <span className="text-xs">
                      TML {r.promedio_tml} min · {r.pct_dentro_meta}% meta
                    </span>
                    <Badge
                      className={
                        r.plan
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                          : "bg-red-100 text-red-700 hover:bg-red-100"
                      }
                    >
                      {r.plan ? `Plan ${r.plan.estado}` : "Sin plan"}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* R1.1.5 TML */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">R1.1.5 — TML con mejora sostenida</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Meta: ≤ {pack.r1_1_5_tml.meta_minutos} min y ≥ {pack.r1_1_5_tml.meta_pct}% dentro meta
            </p>
          </div>
          <Clock className="h-5 w-5 text-slate-400" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">TML global</p>
              <p
                className={`text-2xl font-bold ${
                  pack.r1_1_5_tml.promedio_tml_actual <= 30
                    ? "text-green-600"
                    : pack.r1_1_5_tml.promedio_tml_actual <= 45
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {pack.r1_1_5_tml.promedio_tml_actual} min
              </p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">% dentro meta</p>
              <p
                className={`text-2xl font-bold ${
                  pack.r1_1_5_tml.pct_dentro_meta_actual >= 65
                    ? "text-green-600"
                    : pack.r1_1_5_tml.pct_dentro_meta_actual >= 50
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
              >
                {pack.r1_1_5_tml.pct_dentro_meta_actual}%
              </p>
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-xs text-muted-foreground">Meses en meta</p>
              <p className="text-2xl font-bold">
                {pack.r1_1_5_tml.mensual_en_meta}
                <span className="text-base font-normal text-muted-foreground">
                  /{pack.r1_1_5_tml.mensual_total}
                </span>
              </p>
            </div>
          </div>

          {tmlMensualChart.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                TML por mes
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tmlMensualChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} unit=" min" />
                    <Tooltip formatter={(v) => [`${v} min`, "TML"]} />
                    <ReferenceLine
                      y={30}
                      stroke="#10B981"
                      strokeDasharray="5 5"
                      label={{ value: "Meta 30min", position: "right", fontSize: 10 }}
                    />
                    <Bar dataKey="tml" radius={[4, 4, 0, 0]}>
                      {tmlMensualChart.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={
                            entry.tml <= 30
                              ? "#10B981"
                              : entry.tml <= 45
                              ? "#F59E0B"
                              : "#EF4444"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {yoyChart.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Comparativo año actual vs año anterior
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yoyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} unit=" min" />
                    <Tooltip />
                    <ReferenceLine y={30} stroke="#10B981" strokeDasharray="5 5" />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Año actual"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={{ fill: "#3B82F6", r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="anterior"
                      name="Año anterior"
                      stroke="#94A3B8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ fill: "#94A3B8", r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Índice de módulos de evidencia */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Módulos de evidencia relacionados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/indicadores/tml"
              className="flex items-center gap-2 rounded-md border p-3 hover:bg-slate-50"
            >
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm">Tablero TML + Plan de Acción</span>
            </Link>
            <Link
              href="/indicadores/owd-pre-ruta"
              className="flex items-center gap-2 rounded-md border p-3 hover:bg-slate-50"
            >
              <ClipboardCheck className="h-4 w-4 text-teal-600" />
              <span className="text-sm">OWD Pre-Ruta</span>
            </Link>
            <Link
              href="/capacitaciones/matriz-skap"
              className="flex items-center gap-2 rounded-md border p-3 hover:bg-slate-50"
            >
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-sm">Matriz SKAP SOP 1.1</span>
            </Link>
            <Link
              href="/indicadores/pre-ruta-en-vivo"
              className="flex items-center gap-2 rounded-md border p-3 hover:bg-slate-50"
            >
              <Target className="h-4 w-4 text-indigo-600" />
              <span className="text-sm">Pre-Ruta en Vivo</span>
            </Link>
          </div>
        </CardContent>
      </Card>

      {archivos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archivos de evidencia ({archivos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {archivos.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-md border bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                      <p className="text-sm font-medium">{a.titulo}</p>
                      {a.categoria && (
                        <Badge variant="outline" className="text-[10px]">
                          {a.categoria}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">v{a.current_version}</span>
                    </div>
                    {a.descripcion && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{a.descripcion}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const res = await getDownloadUrl({ archivo_id: a.id })
                      if ("error" in res) return
                      window.open(res.data.url, "_blank")
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

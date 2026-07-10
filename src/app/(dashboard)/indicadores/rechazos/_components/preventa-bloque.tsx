"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowUpDown, ClipboardPlus, ShoppingCart, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  RechazosPreventa,
  TopVariacionDim,
} from "@/lib/types/rechazos"
import {
  formatBultos,
  formatHl,
  formatMonto,
  formatTasa,
} from "@/lib/format/rechazos"
import type { PlanFocoInicial } from "./planes/plan-form-dialog"

type DrillTo = { tipo: TopVariacionDim; id: string | number; label?: string }
type SortKey = "bultos" | "hl" | "eventos" | "clientes" | "monto"

/** Colores fijos por motivo de la categoría Ventas (fallback slate). */
const MOTIVO_COLORS: Record<string, string> = {
  "ERROR DE PREVENTA": "#fb923c", // orange-400
  BEES: "#38bdf8",                // sky-400
  "SIN ENVASES": "#a78bfa",       // violet-400
}
const MOTIVO_COLOR_FALLBACK = "#94a3b8" // slate-400

function motivoColor(ds: string): string {
  return MOTIVO_COLORS[ds] ?? MOTIVO_COLOR_FALLBACK
}

export function PreventaBloque({
  preventa,
  labelActual,
  labelPrevious,
  onDrillTo,
  onCrearPlan,
}: {
  preventa: RechazosPreventa
  labelActual: string
  labelPrevious: string
  onDrillTo?: (d: DrillTo) => void
  onCrearPlan?: (foco: PlanFocoInicial) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>("bultos")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [verTodosVendedores, setVerTodosVendedores] = useState(false)
  const [verTodosClientes, setVerTodosClientes] = useState(false)

  const { actual, previous } = preventa

  const vendedoresSorted = useMemo(() => {
    const sign = sortDir === "desc" ? -1 : 1
    return [...preventa.por_vendedor].sort((a, b) => sign * (a[sortKey] - b[sortKey]))
  }, [preventa.por_vendedor, sortKey, sortDir])
  const vendedoresVisibles = verTodosVendedores
    ? vendedoresSorted
    : vendedoresSorted.slice(0, 8)

  const clientesVisibles = verTodosClientes
    ? preventa.por_cliente
    : preventa.por_cliente.slice(0, 8)

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortKey(k); setSortDir("desc") }
  }

  // Data del gráfico apilado: una key por ds_rechazo.
  const motivosDs = useMemo(
    () => preventa.por_motivo.map((m) => m.ds_rechazo),
    [preventa.por_motivo],
  )
  const chartData = useMemo(
    () =>
      preventa.serie_semana.map((s) => {
        const row: Record<string, number | string> = {
          label: s.semana.slice(-3), // "W28"
          eventos: s.eventos,
        }
        for (const ds of motivosDs) row[ds] = 0
        for (const m of s.por_motivo) row[m.ds_rechazo] = Math.round(m.bultos * 10) / 10
        return row
      }),
    [preventa.serie_semana, motivosDs],
  )

  const empty = actual.eventos === 0

  const kpis: Array<{ label: string; valor: string; delta?: number }> = [
    { label: "Bultos", valor: formatBultos(actual.bultos), delta: actual.bultos - previous.bultos },
    { label: "HL", valor: formatHl(actual.hl), delta: Math.round((actual.hl - previous.hl) * 100) / 100 },
    { label: "Eventos", valor: formatBultos(actual.eventos), delta: actual.eventos - previous.eventos },
    { label: "Clientes afectados", valor: formatBultos(actual.clientes_afectados) },
    { label: "Monto", valor: formatMonto(actual.monto) },
  ]

  return (
    <Card className="border-orange-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShoppingCart className="h-4 w-4 text-orange-500" />
              Errores de preventa
              <Badge variant="outline" className="border-orange-200 bg-orange-50 text-[10px] text-orange-800">
                {formatTasa(preventa.pct_del_total_bultos)} del total rechazado
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Motivos atribuibles a la gestión del preventista ({preventa.por_motivo.length > 0
                ? preventa.por_motivo.map((m) => m.ds_rechazo).join(" · ")
                : "ERROR DE PREVENTA · BEES · SIN ENVASES"}) · {labelActual} vs {labelPrevious}
            </p>
          </div>
          {onCrearPlan && (
            <Button size="sm" variant="outline" onClick={() => onCrearPlan({})}>
              <ClipboardPlus className="mr-1 h-4 w-4" />
              Crear plan de preventa
            </Button>
          )}
        </div>

        {empty ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Sin rechazos por errores de preventa en el período 🎉
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {kpis.map((k) => (
                <div
                  key={k.label}
                  className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5"
                >
                  <p className="text-[11px] leading-tight text-slate-500">{k.label}</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900">{k.valor}</p>
                  {k.delta != null && k.delta !== 0 && (
                    <p
                      className={`text-[11px] font-medium tabular-nums ${
                        k.delta > 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                      title={`vs ${labelPrevious}`}
                    >
                      {k.delta > 0 ? "▲" : "▼"} {formatBultos(Math.abs(k.delta))} vs anterior
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Evolución semanal apilada por motivo */}
              <div>
                <h3 className="mb-1 text-xs font-semibold text-slate-700">
                  Evolución semanal (bultos por motivo)
                </h3>
                {chartData.length === 0 ? (
                  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                    Sin datos
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={40} tickFormatter={(v) => formatBultos(v)} />
                      <Tooltip
                        formatter={(value, name) => [formatBultos(Number(value ?? 0)), name]}
                        labelFormatter={(l) => `Semana ${l}`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {motivosDs.map((ds) => (
                        <Bar key={ds} dataKey={ds} stackId="preventa" fill={motivoColor(ds)} radius={[0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Desglose por motivo */}
              <div>
                <h3 className="mb-1 text-xs font-semibold text-slate-700">
                  Por motivo{onDrillTo ? " · tocá para ver el detalle" : ""}
                </h3>
                <div className="space-y-1.5">
                  {preventa.por_motivo.map((m) => {
                    const maxBultos = Math.max(...preventa.por_motivo.map((x) => x.bultos), 1)
                    const pctBar = Math.max(4, (m.bultos / maxBultos) * 100)
                    return (
                      <button
                        key={m.id_rechazo}
                        type="button"
                        onClick={
                          onDrillTo
                            ? () => onDrillTo({ tipo: "motivo", id: m.id_rechazo, label: m.ds_rechazo })
                            : undefined
                        }
                        className={`w-full rounded-md border border-slate-100 p-2 text-left ${
                          onDrillTo ? "cursor-pointer hover:bg-slate-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-1.5 font-medium text-slate-800">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: motivoColor(m.ds_rechazo) }}
                            />
                            {m.ds_rechazo}
                          </span>
                          <span className="tabular-nums text-slate-900">
                            {formatBultos(m.bultos)} <span className="text-[11px] text-slate-500">bultos</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded"
                            style={{ width: `${pctBar}%`, backgroundColor: motivoColor(m.ds_rechazo) }}
                          />
                        </div>
                        <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
                          <span className="tabular-nums">{formatHl(m.hl)}</span>
                          <span className="tabular-nums">{formatBultos(m.eventos)} eventos</span>
                          <span className="tabular-nums">{formatMonto(m.monto)}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Ranking de preventistas */}
            <div>
              <h3 className="mb-1 text-xs font-semibold text-slate-700">
                Ranking de preventistas · quién genera los rechazos de preventa
              </h3>
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30%]">Preventista</TableHead>
                      <SortableHead label="Bultos"   k="bultos"   current={sortKey} dir={sortDir} onClick={toggleSort} />
                      <SortableHead label="HL"       k="hl"       current={sortKey} dir={sortDir} onClick={toggleSort} />
                      <SortableHead label="Eventos"  k="eventos"  current={sortKey} dir={sortDir} onClick={toggleSort} />
                      <SortableHead label="Clientes" k="clientes" current={sortKey} dir={sortDir} onClick={toggleSort} />
                      <TableHead>vs anterior</TableHead>
                      <TableHead className="w-[22%]">Motivos</TableHead>
                      {onCrearPlan && <TableHead className="w-[60px]" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendedoresVisibles.map((v) => (
                      <TableRow key={v.ds_vendedor}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{v.ds_vendedor}</div>
                          {v.ds_supervisor && (
                            <div className="text-[11px] text-muted-foreground">{v.ds_supervisor}</div>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums font-medium text-slate-900">{formatBultos(v.bultos)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatHl(v.hl)}</TableCell>
                        <TableCell className="tabular-nums">{formatBultos(v.eventos)}</TableCell>
                        <TableCell className="tabular-nums">{formatBultos(v.clientes)}</TableCell>
                        <TableCell>
                          <DeltaBultos actual={v.bultos} previous={v.previous_bultos} />
                        </TableCell>
                        <TableCell className="text-[11px] text-slate-600">
                          {v.motivos_top.map((m) => (
                            <span key={m.id_rechazo} className="mr-2 inline-flex items-center gap-1 whitespace-nowrap">
                              <span
                                className="h-2 w-2 rounded-sm"
                                style={{ backgroundColor: motivoColor(m.ds_rechazo) }}
                              />
                              {formatBultos(m.bultos)}
                            </span>
                          ))}
                        </TableCell>
                        {onCrearPlan && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                              title={`Crear plan de acción para ${v.ds_vendedor}`}
                              onClick={() =>
                                onCrearPlan({
                                  foco_vendedor_id: v.id_vendedor ?? undefined,
                                  foco_vendedor_ds: v.ds_vendedor,
                                })
                              }
                            >
                              <ClipboardPlus className="mr-0.5 h-3.5 w-3.5" />
                              Plan
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {vendedoresSorted.length > 8 && (
                <button
                  type="button"
                  onClick={() => setVerTodosVendedores((s) => !s)}
                  className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {verTodosVendedores
                    ? "Ver menos"
                    : `Ver los ${vendedoresSorted.length} preventistas`}
                </button>
              )}
            </div>

            {/* Clientes reincidentes */}
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                Clientes reincidentes · mismo cliente, varios rechazos de preventa
              </h3>
              <div className="overflow-x-auto">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Cliente</TableHead>
                      <TableHead>Eventos</TableHead>
                      <TableHead>Bultos</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead className="w-[28%]">Preventista(s)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientesVisibles.map((c) => (
                      <TableRow
                        key={c.id_cliente}
                        className={onDrillTo ? "cursor-pointer" : ""}
                        onClick={
                          onDrillTo
                            ? () => onDrillTo({ tipo: "cliente", id: c.id_cliente, label: c.nombre_cliente })
                            : undefined
                        }
                      >
                        <TableCell className="font-medium text-slate-900">
                          {c.nombre_cliente}
                        </TableCell>
                        <TableCell
                          className={`tabular-nums ${
                            c.eventos >= 2 ? "font-semibold text-orange-700" : ""
                          }`}
                        >
                          {formatBultos(c.eventos)}
                          {c.eventos >= 2 && (
                            <span className="ml-1 text-[10px]" title="Cliente con rechazos repetidos de preventa">⚠</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatBultos(c.bultos)}</TableCell>
                        <TableCell className="tabular-nums">{formatMonto(c.monto)}</TableCell>
                        <TableCell className="text-[11px] text-slate-600">
                          {c.vendedores.join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preventa.por_cliente.length > 8 && (
                <button
                  type="button"
                  onClick={() => setVerTodosClientes((s) => !s)}
                  className="mt-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {verTodosClientes
                    ? "Ver menos"
                    : `Ver los ${preventa.por_cliente.length} clientes`}
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Variación de bultos vs período anterior: rojo si sube, verde si baja. */
function DeltaBultos({ actual, previous }: { actual: number; previous: number }) {
  const delta = actual - previous
  if (previous === 0 && actual > 0) {
    return <span className="text-[11px] font-medium text-red-600">nuevo</span>
  }
  if (Math.round(delta) === 0) {
    return <span className="text-[11px] tabular-nums text-slate-400">=</span>
  }
  return (
    <span
      className={`text-[11px] font-medium tabular-nums ${
        delta > 0 ? "text-red-600" : "text-emerald-600"
      }`}
    >
      {delta > 0 ? "▲" : "▼"} {formatBultos(Math.abs(delta))}
    </span>
  )
}

function SortableHead({
  label, k, current, dir, onClick,
}: {
  label: string; k: SortKey; current: SortKey; dir: "desc" | "asc"; onClick: (k: SortKey) => void
}) {
  const active = current === k
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-0.5 font-medium ${active ? "text-slate-900" : "text-muted-foreground hover:text-slate-700"}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "asc" ? "rotate-180" : ""}`} />
      </button>
    </TableHead>
  )
}

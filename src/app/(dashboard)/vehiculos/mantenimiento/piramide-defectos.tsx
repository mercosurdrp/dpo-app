"use client"

import { useMemo, useState } from "react"
import { Info, TriangleAlert } from "lucide-react"
import { useTheme } from "next-themes"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MantenimientoRealizado } from "@/types/database"
import type { ChecklistItemNoOk } from "@/actions/mantenimiento-vehiculos"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  mantenimientos: MantenimientoRealizado[]
}

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)
const fmtPct = (v: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v)}%`

/** El día "de hoy" se calcula en la zona del negocio para que el servidor y el
 *  navegador escriban lo mismo (si no, entre las 21 y las 24 difieren). */
const TZ = "America/Argentina/Buenos_Aires"
const fmtISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const hoyISO = () => fmtISO.format(new Date())

type Granularidad = "dia" | "mes" | "anio" | "12m" | "rango" | "todo"

const GRANULARIDADES: { value: Granularidad; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "mes", label: "Mes" },
  { value: "anio", label: "Año" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "rango", label: "Rango de fechas" },
  { value: "todo", label: "Histórico completo" },
]

// Niveles de la pirámide, de la PUNTA (grave) hacia la BASE (leve).
const NIVELES = [
  {
    key: "averia",
    titulo: "Avería grave / fuera de servicio",
    detalle: "Correctivos con la unidad parada en taller",
    color: "#C0392B",
  },
  {
    key: "correctivo",
    titulo: "Falla → correctivo en taller",
    detalle: "Mantenimientos correctivos registrados",
    color: "#E67E22",
  },
  {
    key: "critico",
    titulo: "Defecto crítico detectado",
    detalle: "Ítems críticos no conformes en checklist",
    color: "#F1C40F",
  },
  {
    key: "leve",
    titulo: "Observaciones / defectos leves",
    detalle: "Ítems no conformes no críticos en checklist",
    color: "#5DADE2",
  },
] as const

/** Paleta categórica de la torta: 7 tonos + gris para "Otras unidades".
 *  Validada para daltonismo y para cada superficie (clara y oscura). */
const SERIES_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
]
const SERIES_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
]
const OTRAS_LIGHT = "#8f8f88"
const OTRAS_DARK = "#a3a39a"
const MAX_PORCIONES = SERIES_LIGHT.length

/** Resta meses a una fecha ISO sin caer en el 31 de un mes que no lo tiene. */
function restarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number)
  const base = new Date(Date.UTC(a, m - 1 - meses, 1))
  const ultimoDia = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const dia = String(Math.min(d, ultimoDia)).padStart(2, "0")
  const mes = String(base.getUTCMonth() + 1).padStart(2, "0")
  return `${base.getUTCFullYear()}-${mes}-${dia}`
}

/** Último día del mes de un `YYYY-MM`. */
function finDeMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number)
  const dia = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return `${ym}-${String(dia).padStart(2, "0")}`
}

interface PorcionTorta {
  dominio: string
  leves: number
  criticos: number
  total: number
  pct: number
  esOtras: boolean
}

export function PiramideDefectos({ itemsNoOk, mantenimientos }: Props) {
  const [granularidad, setGranularidad] = useState<Granularidad>("anio")
  const [dia, setDia] = useState(hoyISO)
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7))
  const [anio, setAnio] = useState(() => hoyISO().slice(0, 4))
  const [desde, setDesde] = useState(() => restarMeses(hoyISO(), 1))
  const [hasta, setHasta] = useState(hoyISO)

  // Los colores dependen del tema. `resolvedTheme` recién tiene valor después
  // de montar, así que el primer pintado coincide con el del servidor (paleta
  // clara) y no hay desajuste de hidratación.
  const { resolvedTheme } = useTheme()
  const oscuro = resolvedTheme === "dark"
  const seriesColores = oscuro ? SERIES_DARK : SERIES_LIGHT
  const colorOtras = oscuro ? OTRAS_DARK : OTRAS_LIGHT

  // Años con datos, para no ofrecer años vacíos en el selector.
  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const i of itemsNoOk) if (i.fecha) set.add(i.fecha.slice(0, 4))
    for (const m of mantenimientos) if (m.fecha) set.add(m.fecha.slice(0, 4))
    set.add(hoyISO().slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [itemsNoOk, mantenimientos])

  // Rango efectivo [desde, hasta] en ISO; null = sin límite.
  const rango = useMemo<{ desde: string | null; hasta: string | null }>(() => {
    switch (granularidad) {
      case "dia":
        return { desde: dia, hasta: dia }
      case "mes":
        return { desde: `${mes}-01`, hasta: finDeMes(mes) }
      case "anio":
        return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
      case "12m":
        return { desde: restarMeses(hoyISO(), 12), hasta: hoyISO() }
      case "rango":
        return {
          desde: desde || null,
          hasta: hasta || null,
        }
      default:
        return { desde: null, hasta: null }
    }
  }, [granularidad, dia, mes, anio, desde, hasta])

  const etiquetaRango = useMemo(() => {
    if (!rango.desde && !rango.hasta) return "Histórico completo"
    const f = (iso: string) => iso.split("-").reverse().join("/")
    if (rango.desde && rango.hasta) {
      if (rango.desde === rango.hasta) return f(rango.desde)
      return `${f(rango.desde)} al ${f(rango.hasta)}`
    }
    return rango.desde ? `desde ${f(rango.desde)}` : `hasta ${f(rango.hasta!)}`
  }, [rango])

  const datos = useMemo(() => {
    const dentro = (fechaISO: string | null | undefined) => {
      const f = (fechaISO || "").slice(0, 10)
      if (!f) return false
      if (rango.desde && f < rango.desde) return false
      if (rango.hasta && f > rango.hasta) return false
      return true
    }

    const items = itemsNoOk.filter((i) => dentro(i.fecha))
    const mantes = mantenimientos.filter((m) => dentro(m.fecha))
    const correctivos = mantes.filter((m) => m.tipo === "correctivo")

    const conteo: Record<string, number> = {
      leve: items.filter((i) => !i.critico).length,
      critico: items.filter((i) => i.critico).length,
      correctivo: correctivos.length,
      averia: correctivos.filter((m) => m.estado === "en_taller").length,
    }

    const porUnidad = new Map<string, { leves: number; criticos: number }>()
    for (const i of items) {
      const u = porUnidad.get(i.dominio) ?? { leves: 0, criticos: 0 }
      if (i.critico) u.criticos++
      else u.leves++
      porUnidad.set(i.dominio, u)
    }
    const ranking = Array.from(porUnidad.entries())
      .map(([dominio, v]) => ({ dominio, ...v, total: v.leves + v.criticos }))
      .sort((a, b) => b.total - a.total || a.dominio.localeCompare(b.dominio))

    const totalDefectos = conteo.leve + conteo.critico

    // Torta: una porción por unidad; a partir de la octava se agrupan para que
    // el gráfico siga siendo legible (el detalle completo está en la tabla).
    const pct = (n: number) => (totalDefectos > 0 ? (n * 100) / totalDefectos : 0)
    const torta: PorcionTorta[] = ranking
      .slice(0, MAX_PORCIONES)
      .map((u) => ({ ...u, pct: pct(u.total), esOtras: false }))
    const resto = ranking.slice(MAX_PORCIONES)
    if (resto.length > 0) {
      const leves = resto.reduce((s, u) => s + u.leves, 0)
      const criticos = resto.reduce((s, u) => s + u.criticos, 0)
      const total = leves + criticos
      torta.push({
        dominio: `Otras ${resto.length} unidades`,
        leves,
        criticos,
        total,
        pct: pct(total),
        esOtras: true,
      })
    }

    const ratioFalla =
      conteo.correctivo > 0
        ? Math.round(totalDefectos / conteo.correctivo)
        : null

    return { conteo, ranking, torta, totalDefectos, ratioFalla }
  }, [itemsNoOk, mantenimientos, rango])

  const colorPorcion = (p: PorcionTorta, i: number) =>
    p.esOtras ? colorOtras : seriesColores[i % seriesColores.length]

  // ===== Geometría de la pirámide (SVG compacto) =====
  const NIV = NIVELES.length // 4
  const VIEW_W = 560
  const VIEW_H = 230
  const ALTO_NIV = VIEW_H / NIV
  const PYR_LEFT = 24
  const PYR_W = 300
  const PYR_CX = PYR_LEFT + PYR_W / 2
  const PYR_RIGHT = PYR_LEFT + PYR_W
  const TOP_W = 0.16

  function widths(n: number): { top: number; bottom: number } {
    const top = TOP_W + (1 - TOP_W) * (n / NIV)
    const bottom = TOP_W + (1 - TOP_W) * ((n + 1) / NIV)
    return { top, bottom }
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + rango de fechas */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            Pirámide de defectos de flota
          </h2>
          <DpoSeccionCinta seccionId="piramide" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44 shrink-0">
            <Select
              value={granularidad}
              onValueChange={(v: string | null) =>
                setGranularidad((v as Granularidad) ?? "anio")
              }
            >
              <SelectTrigger aria-label="Granularidad del período">
                <SelectValue>
                  {(v: string | null) =>
                    GRANULARIDADES.find((g) => g.value === v)?.label ?? "Año"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GRANULARIDADES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {granularidad === "dia" && (
            <Input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="w-40"
              aria-label="Día"
            />
          )}

          {granularidad === "mes" && (
            <Input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-40"
              aria-label="Mes"
            />
          )}

          {granularidad === "anio" && (
            <div className="w-28 shrink-0">
              <Select
                value={anio}
                onValueChange={(v: string | null) =>
                  setAnio(v ?? hoyISO().slice(0, 4))
                }
              >
                <SelectTrigger aria-label="Año">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aniosDisponibles.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {granularidad === "rango" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                className="w-36"
                aria-label="Desde"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <Input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                className="w-36"
                aria-label="Hasta"
              />
            </div>
          )}
        </div>
      </div>

      {/* Pirámide */}
      <div className="rounded-lg border bg-card p-3">
        <div className="mx-auto max-w-xl">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {NIVELES.map((n, i) => {
              const { top, bottom } = widths(i)
              const yTop = i * ALTO_NIV
              const yBot = (i + 1) * ALTO_NIV
              const xTopL = PYR_CX - (top * PYR_W) / 2
              const xTopR = PYR_CX + (top * PYR_W) / 2
              const xBotL = PYR_CX - (bottom * PYR_W) / 2
              const xBotR = PYR_CX + (bottom * PYR_W) / 2
              const points = `${xTopL},${yTop} ${xTopR},${yTop} ${xBotR},${yBot} ${xBotL},${yBot}`
              const count = datos.conteo[n.key] ?? 0
              const cy = yTop + ALTO_NIV / 2
              return (
                <g key={n.key}>
                  <polygon
                    points={points}
                    fill={n.color}
                    className="stroke-card"
                    strokeWidth={1.2}
                  />
                  {/* Conteo en el centro */}
                  <text
                    x={PYR_CX}
                    y={cy + 5}
                    textAnchor="middle"
                    fontSize={i === 0 ? 13 : 16}
                    fontWeight={900}
                    fill="#FFFFFF"
                    style={{
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.35)",
                      strokeWidth: 2.5,
                    }}
                  >
                    {count}
                  </text>
                  {/* Etiqueta a la derecha */}
                  <text
                    x={PYR_RIGHT + 10}
                    y={cy + 4}
                    textAnchor="start"
                    fontSize={11}
                    fontWeight={500}
                    className="fill-foreground"
                  >
                    {n.titulo}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] italic text-muted-foreground">
          <Info className="size-3" />
          De la base (defectos leves de checklist) a la punta (avería grave).
          Gestionando la base se previene la punta.
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard
          label="Defectos"
          valor={fmtNum(datos.totalDefectos)}
          sub="Ítems no conformes de checklist"
        />
        <KpiCard
          label="Críticos"
          valor={fmtNum(datos.conteo.critico)}
          estado={datos.conteo.critico > 0 ? "alerta" : "ok"}
          sub="Defectos críticos detectados"
        />
        <KpiCard
          label="Correctivos"
          valor={fmtNum(datos.conteo.correctivo)}
          estado={datos.conteo.correctivo > 0 ? "alerta" : "ok"}
          sub="Fallas que llegaron al taller"
        />
        <KpiCard
          label="Defectos / correctivo"
          valor={datos.ratioFalla !== null ? `${datos.ratioFalla} : 1` : "—"}
          dpo="4.2"
          sub="Base detectada por cada falla en taller"
        />
      </div>

      {/* Torta: reparto de los defectos entre las unidades */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Reparto de defectos por vehículo
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {fmtNum(datos.totalDefectos)}{" "}
            {datos.totalDefectos === 1 ? "defecto" : "defectos"} de checklist ·{" "}
            {etiquetaRango}
          </p>
        </CardHeader>
        <CardContent>
          {datos.torta.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sin defectos registrados en el período seleccionado.
            </p>
          ) : (
            <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={datos.torta}
                    dataKey="total"
                    nameKey="dominio"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={100}
                    paddingAngle={1.5}
                    isAnimationActive={false}
                  >
                    {datos.torta.map((p, i) => (
                      <Cell
                        key={p.dominio}
                        fill={colorPorcion(p, i)}
                        className="stroke-card"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0].payload as PorcionTorta
                      return (
                        <div className="rounded-md border bg-popover p-2 text-xs shadow-md">
                          <div className="mb-1 font-semibold text-foreground">
                            {p.dominio}
                          </div>
                          <div className="space-y-0.5 text-muted-foreground">
                            <div>
                              Defectos:{" "}
                              <span className="font-medium tabular-nums text-foreground">
                                {fmtNum(p.total)}
                              </span>{" "}
                              ({fmtPct(p.pct)})
                            </div>
                            <div>
                              Leves:{" "}
                              <span className="tabular-nums text-foreground">
                                {fmtNum(p.leves)}
                              </span>
                            </div>
                            <div>
                              Críticos:{" "}
                              <span className="tabular-nums text-foreground">
                                {fmtNum(p.criticos)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Leyenda: la identidad nunca queda librada sólo al color */}
              <ul className="space-y-1.5 text-xs">
                {datos.torta.map((p, i) => (
                  <li key={p.dominio} className="flex items-center gap-2">
                    <span
                      className="size-2.5 flex-none rounded-sm"
                      style={{ backgroundColor: colorPorcion(p, i) }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate text-foreground">
                      {p.dominio}
                      {p.criticos > 0 && (
                        <TriangleAlert className="ml-1 inline size-3 text-amber-600 dark:text-amber-400" />
                      )}
                    </span>
                    <span className="tabular-nums font-medium text-foreground">
                      {fmtNum(p.total)}
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {fmtPct(p.pct)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking por unidad */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">
            Defectos por unidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {datos.ranking.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              Sin defectos registrados en checklists para el período
              seleccionado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Leves</TableHead>
                  <TableHead className="text-right">Críticos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.ranking.map((u) => (
                  <TableRow key={u.dominio}>
                    <TableCell className="font-medium">
                      {u.dominio}
                      {u.criticos > 0 && (
                        <TriangleAlert className="ml-1 inline size-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(u.leves)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.criticos > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        >
                          {fmtNum(u.criticos)}
                        </Badge>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {fmtNum(u.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {datos.totalDefectos > 0
                        ? fmtPct((u.total * 100) / datos.totalDefectos)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Info, TriangleAlert, X } from "lucide-react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MantenimientoRealizado } from "@/types/database"
import type { ChecklistItemNoOk } from "@/actions/mantenimiento-vehiculos"
import { cn } from "@/lib/utils"
import { DpoSeccionCinta } from "./_components/dpo-badge"
import { KpiCard } from "./_components/kpi-card"
import {
  FiltroPeriodo,
  dentroDe,
  etiquetaDe,
  hoyISO,
  periodoInicial,
  rangoDe,
  type PeriodoState,
} from "./_components/filtro-periodo"
import { MAX_SERIES, usePaletaViz } from "./_components/paleta-viz"
import {
  getCalidadDeteccion,
  type ExposicionUnidad,
} from "@/actions/checklist-deteccion"

interface Props {
  itemsNoOk: ChecklistItemNoOk[]
  mantenimientos: MantenimientoRealizado[]
}

const fmtNum = (v: number) => new Intl.NumberFormat("es-AR").format(v)
const fmtPct = (v: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(v)}%`

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

interface PorcionTorta {
  dominio: string
  leves: number
  criticos: number
  total: number
  pct: number
  esOtras: boolean
}

/** Un ítem del checklist que falló, con todas sus repeticiones juntas. */
interface ItemFallado {
  categoria: string
  item: string
  critico: boolean
  veces: number
  primera: string
  ultima: string
  comentarios: string[]
}

const fmtFecha = (iso: string) => iso.split("-").reverse().join("/")

/** Excel del período: las cuatro hojas que pide la auditoría del punto 1.3. */
function urlExport(r: { desde: string | null; hasta: string | null }): string {
  const p = new URLSearchParams()
  if (r.desde) p.set("desde", r.desde)
  if (r.hasta) p.set("hasta", r.hasta)
  const qs = p.toString()
  return `/api/vehiculos/checklist/export${qs ? `?${qs}` : ""}`
}

export function PiramideDefectos({ itemsNoOk, mantenimientos }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoState>(() => periodoInicial())
  const paleta = usePaletaViz()
  // Cuántos checklists tuvo cada unidad en el período: sin ese denominador, la
  // unidad que más se controla parece la peor.
  const [exposicion, setExposicion] = useState<Map<string, ExposicionUnidad>>(
    new Map()
  )

  // Años con datos, para no ofrecer años vacíos en el selector.
  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const i of itemsNoOk) if (i.fecha) set.add(i.fecha.slice(0, 4))
    for (const m of mantenimientos) if (m.fecha) set.add(m.fecha.slice(0, 4))
    set.add(hoyISO().slice(0, 4))
    return Array.from(set).sort((a, b) => b.localeCompare(a))
  }, [itemsNoOk, mantenimientos])

  const rango = useMemo(() => rangoDe(periodo), [periodo])
  const etiquetaRango = useMemo(() => etiquetaDe(rango), [rango])

  useEffect(() => {
    let vigente = true
    getCalidadDeteccion(rango).then((res) => {
      if (!vigente || "error" in res) return
      setExposicion(new Map(res.data.porUnidad.map((u) => [u.dominio, u])))
    })
    return () => {
      vigente = false
    }
  }, [rango])

  const datos = useMemo(() => {
    const items = itemsNoOk.filter((i) => dentroDe(i.fecha, rango))
    const mantes = mantenimientos.filter((m) => dentroDe(m.fecha, rango))
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

    // Qué falló en cada unidad: mismo ítem repetido = una sola fila con sus
    // veces, el período en que viene apareciendo y lo que escribió el chofer.
    const detalle = new Map<string, ItemFallado[]>()
    const porItem = new Map<string, Map<string, ItemFallado>>()
    for (const i of items) {
      const items_ = porItem.get(i.dominio) ?? new Map<string, ItemFallado>()
      const clave = `${i.categoria}|${i.item}`
      const agg = items_.get(clave) ?? {
        categoria: i.categoria,
        item: i.item,
        critico: i.critico,
        veces: 0,
        primera: i.fecha,
        ultima: i.fecha,
        comentarios: [],
      }
      agg.veces++
      agg.critico = agg.critico || i.critico
      if (i.fecha < agg.primera) agg.primera = i.fecha
      if (i.fecha > agg.ultima) agg.ultima = i.fecha
      const com = i.comentario?.trim()
      if (com && !agg.comentarios.includes(com)) agg.comentarios.push(com)
      items_.set(clave, agg)
      porItem.set(i.dominio, items_)
    }
    for (const [dominio, m] of porItem) {
      detalle.set(
        dominio,
        Array.from(m.values()).sort(
          (a, b) =>
            b.veces - a.veces ||
            Number(b.critico) - Number(a.critico) ||
            a.item.localeCompare(b.item)
        )
      )
    }

    const ranking = Array.from(porUnidad.entries())
      .map(([dominio, v]) => {
        const total = v.leves + v.criticos
        const checks = exposicion.get(dominio)?.checklists ?? null
        return {
          dominio,
          ...v,
          total,
          principal: detalle.get(dominio)?.[0] ?? null,
          distintos: detalle.get(dominio)?.length ?? 0,
          checklists: checks,
          // Cada 10 revisiones, para poder comparar un autoelevador que se
          // chequea 40 veces contra un camión que se chequea 120.
          cada10: checks && checks > 0 ? (total / checks) * 10 : null,
        }
      })
      .sort((a, b) => b.total - a.total || a.dominio.localeCompare(b.dominio))

    const totalDefectos = conteo.leve + conteo.critico

    // Torta: una porción por unidad; a partir de la octava se agrupan para que
    // el gráfico siga siendo legible (el detalle completo está en la tabla).
    const pct = (n: number) => (totalDefectos > 0 ? (n * 100) / totalDefectos : 0)
    const torta: PorcionTorta[] = ranking
      .slice(0, MAX_SERIES)
      .map(({ dominio, leves, criticos, total }) => ({
        dominio,
        leves,
        criticos,
        total,
        pct: pct(total),
        esOtras: false,
      }))
    const resto = ranking.slice(MAX_SERIES)
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

    return { conteo, ranking, torta, detalle, totalDefectos, ratioFalla }
  }, [itemsNoOk, mantenimientos, rango, exposicion])

  const colorPorcion = (p: PorcionTorta, i: number) =>
    p.esOtras ? paleta.otras : paleta.serie(i)

  // Unidad abierta en el panel de detalle (click en la torta o en la tabla).
  const [unidadSel, setUnidadSel] = useState<string | null>(null)
  const detalleSel = unidadSel ? (datos.detalle.get(unidadSel) ?? null) : null
  const resumenSel = unidadSel
    ? (datos.ranking.find((u) => u.dominio === unidadSel) ?? null)
    : null
  const verUnidad = (dominio: string) =>
    setUnidadSel((actual) => (actual === dominio ? null : dominio))

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
          <FiltroPeriodo
            value={periodo}
            onChange={setPeriodo}
            anios={aniosDisponibles}
          />
          <a
            href={urlExport(rango)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="size-4" aria-hidden /> Excel
          </a>
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
            {etiquetaRango} · tocá una porción para ver qué falló
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
                    cursor="pointer"
                    onClick={(_, i) => {
                      const p = datos.torta[i]
                      if (p && !p.esOtras) verUnidad(p.dominio)
                    }}
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
                {datos.torta.map((p, i) => {
                  const Fila = p.esOtras ? "div" : "button"
                  return (
                    <li key={p.dominio}>
                      <Fila
                        type={p.esOtras ? undefined : "button"}
                        onClick={
                          p.esOtras ? undefined : () => verUnidad(p.dominio)
                        }
                        aria-pressed={p.esOtras ? undefined : unidadSel === p.dominio}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left",
                          !p.esOtras && "hover:bg-muted",
                          unidadSel === p.dominio && "bg-muted"
                        )}
                      >
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
                      </Fila>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* Detalle de la unidad elegida: qué falló, cuántas veces y desde cuándo */}
          {detalleSel && resumenSel && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {resumenSel.dominio}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtNum(resumenSel.total)}{" "}
                    {resumenSel.total === 1 ? "defecto" : "defectos"} ·{" "}
                    {fmtNum(resumenSel.distintos)}{" "}
                    {resumenSel.distintos === 1
                      ? "ítem distinto"
                      : "ítems distintos"}
                    {resumenSel.checklists != null && (
                      <>
                        {" · "}
                        {new Intl.NumberFormat("es-AR", {
                          maximumFractionDigits: 1,
                        }).format(resumenSel.cada10 ?? 0)}{" "}
                        cada 10 checklists
                      </>
                    )}
                    {resumenSel.principal && resumenSel.total > 1 && (
                      <>
                        {" · "}
                        {fmtNum(resumenSel.principal.veces)} de{" "}
                        {fmtNum(resumenSel.total)} son{" "}
                        <span className="font-medium text-foreground">
                          {resumenSel.principal.item}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUnidadSel(null)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Cerrar el detalle"
                >
                  <X className="size-4" />
                </button>
              </div>

              <ul className="mt-2 space-y-2">
                {detalleSel.map((d) => (
                  <li
                    key={`${d.categoria}|${d.item}`}
                    className="rounded-md border bg-card p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {d.item}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {d.categoria}
                      </Badge>
                      {d.critico && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                        >
                          crítico
                        </Badge>
                      )}
                      <span className="ml-auto text-xs font-semibold tabular-nums text-foreground">
                        {fmtNum(d.veces)}{" "}
                        <span className="font-normal text-muted-foreground">
                          {d.veces === 1 ? "vez" : "veces"}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {d.primera === d.ultima
                        ? fmtFecha(d.primera)
                        : `${fmtFecha(d.primera)} al ${fmtFecha(d.ultima)}`}
                      {d.comentarios.length > 0 && (
                        <>
                          {" · "}
                          <span className="italic">
                            «{d.comentarios.slice(0, 3).join("» · «")}»
                          </span>
                          {d.comentarios.length > 3 &&
                            ` +${d.comentarios.length - 3}`}
                        </>
                      )}
                    </p>
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
                  <TableHead>Defecto principal</TableHead>
                  <TableHead className="text-right">Leves</TableHead>
                  <TableHead className="text-right">Críticos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                  <TableHead className="text-right">Cada 10 checks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.ranking.map((u) => (
                  <TableRow
                    key={u.dominio}
                    onClick={() => verUnidad(u.dominio)}
                    className={cn(
                      "cursor-pointer",
                      unidadSel === u.dominio && "bg-muted"
                    )}
                  >
                    <TableCell className="font-medium">
                      {u.dominio}
                      {u.criticos > 0 && (
                        <TriangleAlert className="ml-1 inline size-3.5 text-amber-600 dark:text-amber-400" />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[22rem] text-xs text-muted-foreground">
                      {u.principal ? (
                        <span className="line-clamp-2">
                          {u.principal.item}
                          <span className="ml-1 tabular-nums">
                            ({fmtNum(u.principal.veces)} de {fmtNum(u.total)})
                          </span>
                        </span>
                      ) : (
                        "—"
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
                    <TableCell className="text-right tabular-nums">
                      {u.cada10 == null ? (
                        "—"
                      ) : (
                        <>
                          <span className="font-semibold text-foreground">
                            {new Intl.NumberFormat("es-AR", {
                              maximumFractionDigits: 1,
                            }).format(u.cada10)}
                          </span>
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            ({fmtNum(u.checklists ?? 0)} checks)
                          </span>
                        </>
                      )}
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

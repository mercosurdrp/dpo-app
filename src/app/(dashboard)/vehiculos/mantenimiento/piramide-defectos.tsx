"use client"

import { useMemo, useState } from "react"
import { Info, TriangleAlert } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

type PeriodoKey = "anio" | "12m" | "todo"

const PERIODO_OPCIONES: { value: PeriodoKey; label: string }[] = [
  { value: "anio", label: "Año en curso" },
  { value: "12m", label: "Últimos 12 meses" },
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

function dentroDePeriodo(fechaISO: string, periodo: PeriodoKey): boolean {
  if (periodo === "todo") return true
  const f = (fechaISO || "").slice(0, 10)
  if (!f) return false
  const hoy = new Date()
  if (periodo === "anio") return f.slice(0, 4) === String(hoy.getFullYear())
  const limite = new Date(hoy)
  limite.setMonth(limite.getMonth() - 12)
  return f >= limite.toISOString().slice(0, 10)
}

export function PiramideDefectos({ itemsNoOk, mantenimientos }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoKey>("anio")

  const datos = useMemo(() => {
    const items = itemsNoOk.filter((i) => dentroDePeriodo(i.fecha, periodo))
    const mantes = mantenimientos.filter((m) => dentroDePeriodo(m.fecha, periodo))
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
      .sort((a, b) => b.total - a.total)

    const totalDefectos = conteo.leve + conteo.critico
    const ratioFalla =
      conteo.correctivo > 0
        ? Math.round(totalDefectos / conteo.correctivo)
        : null

    return { conteo, ranking, totalDefectos, ratioFalla }
  }, [itemsNoOk, mantenimientos, periodo])

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
      {/* Encabezado + período */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">
            Pirámide de defectos de flota
          </h2>
          <DpoSeccionCinta seccionId="piramide" />
        </div>
        <div className="w-48 shrink-0">
          <Select
            value={periodo}
            onValueChange={(v: string | null) =>
              setPeriodo((v as PeriodoKey) ?? "anio")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODO_OPCIONES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

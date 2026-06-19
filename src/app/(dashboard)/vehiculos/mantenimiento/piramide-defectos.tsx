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

// Niveles de la pirámide, de la BASE (ancho, leve) a la PUNTA (angosto, grave).
// El ancho es fijo por nivel para que siempre se vea como pirámide; el dato real
// es el número de eventos.
const NIVELES = [
  {
    key: "averia",
    titulo: "Avería grave / fuera de servicio",
    detalle: "Correctivos con la unidad parada en taller",
    ancho: "34%",
    barra: "bg-red-500",
    chip: "border-red-200 bg-red-100 text-red-700",
  },
  {
    key: "correctivo",
    titulo: "Falla → correctivo en taller",
    detalle: "Mantenimientos correctivos registrados",
    ancho: "56%",
    barra: "bg-orange-500",
    chip: "border-orange-200 bg-orange-100 text-orange-700",
  },
  {
    key: "critico",
    titulo: "Defecto crítico detectado",
    detalle: "Ítems críticos no conformes en checklist",
    ancho: "78%",
    barra: "bg-amber-400",
    chip: "border-amber-200 bg-amber-100 text-amber-800",
  },
  {
    key: "leve",
    titulo: "Observaciones / defectos leves",
    detalle: "Ítems no conformes no críticos en checklist",
    ancho: "100%",
    barra: "bg-sky-400",
    chip: "border-sky-200 bg-sky-100 text-sky-700",
  },
] as const

function dentroDePeriodo(fechaISO: string, periodo: PeriodoKey): boolean {
  if (periodo === "todo") return true
  const f = (fechaISO || "").slice(0, 10)
  if (!f) return false
  const hoy = new Date()
  if (periodo === "anio") return f.slice(0, 4) === String(hoy.getFullYear())
  // últimos 12 meses
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

    // Defectos por unidad (ítems no conformes), top
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

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="size-5 shrink-0 text-blue-600" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Pirámide de defectos de flota
            </p>
            <p className="mt-1">
              Misma lógica que la pirámide de seguridad: en la{" "}
              <strong>base</strong> los defectos leves detectados en los
              checklists y, hacia la <strong>punta</strong>, los eventos graves.
              Por cada avería grave hay debajo muchos defectos menores —
              gestionando la base se previene la punta.
            </p>
          </div>
        </div>
      </div>

      {/* Selector de período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Composición de defectos
        </h2>
        <div className="w-52">
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
      <Card>
        <CardContent className="space-y-2 py-6">
          {NIVELES.map((n) => {
            const cant = datos.conteo[n.key] ?? 0
            return (
              <div
                key={n.key}
                className="mx-auto flex items-center justify-center"
                style={{ width: n.ancho }}
              >
                <div
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-4 py-3 text-white ${n.barra}`}
                >
                  <span className="text-sm font-medium drop-shadow-sm">
                    {n.titulo}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {fmtNum(cant)}
                  </span>
                </div>
              </div>
            )
          })}
          {/* Leyenda de fuentes */}
          <div className="mx-auto mt-3 max-w-2xl space-y-1 pt-2 text-center text-xs text-muted-foreground">
            {NIVELES.map((n) => (
              <p key={n.key}>
                <span className="font-medium text-slate-600">{n.titulo}:</span>{" "}
                {n.detalle}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Defectos detectados</p>
            <p className="text-lg font-bold text-slate-900">
              {fmtNum(datos.totalDefectos)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">de ellos, críticos</p>
            <p className="text-lg font-bold text-amber-700">
              {fmtNum(datos.conteo.critico)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Correctivos</p>
            <p className="text-lg font-bold text-orange-700">
              {fmtNum(datos.conteo.correctivo)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">
              Defectos por correctivo
            </p>
            <p className="text-lg font-bold text-slate-900">
              {datos.ratioFalla !== null ? `${datos.ratioFalla} : 1` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ranking por unidad */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-slate-700">
            Defectos por unidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {datos.ranking.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
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
                        <TriangleAlert className="ml-1 inline size-3.5 text-amber-600" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNum(u.leves)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.criticos > 0 ? (
                        <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
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

"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useMemo, useState } from "react"
import { AlertTriangle, ChevronRight, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { ChoferesResumenMes, ChoferResumenRow } from "@/actions/choferes"
import { SIN_ASIGNAR_SENTINEL } from "@/lib/choferes/detalle-chofer"
import { etiquetaFletero, limpiarNombreChofer } from "@/lib/gescom/etiqueta-fletero"

type SortKey =
  | "bultos"
  | "hl"
  | "viajes"
  | "dias_trabajados"
  | "tml_promedio"
  | "rechazos_pct"
  | "chofer_nombre"

interface Props {
  data: ChoferesResumenMes
  desde: string
  hasta: string
}

export function ChoferesRankingClient({ data, desde, hasta }: Props) {
  const router = useRouter()
  const [desdeStr, setDesdeStr] = useState(desde)
  const [hastaStr, setHastaStr] = useState(hasta)
  const [sortKey, setSortKey] = useState<SortKey>("bultos")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const filas = useMemo(() => {
    const arr = [...data.filas]
    arr.sort((a, b) => {
      const va = valor(a, sortKey)
      const vb = valor(b, sortKey)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const na = Number(va)
      const nb = Number(vb)
      return sortDir === "asc" ? na - nb : nb - na
    })
    return arr
  }, [data.filas, sortKey, sortDir])

  function aplicarRango() {
    const params = new URLSearchParams()
    params.set("desde", desdeStr)
    params.set("hasta", hastaStr)
    router.push(`/indicadores/choferes?${params.toString()}`)
  }

  function clickHeader(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(k)
      setSortDir(k === "chofer_nombre" ? "asc" : "desc")
    }
  }

  function irADetalle(fila: ChoferResumenRow) {
    const id = fila.chofer_id ?? SIN_ASIGNAR_SENTINEL
    const params = new URLSearchParams()
    params.set("desde", desde)
    params.set("hasta", hasta)
    router.push(`/indicadores/choferes/${encodeURIComponent(id)}?${params.toString()}`)
  }

  const totalBultos = data.filas.reduce((s, f) => s + f.bultos, 0)
  const totalHl = data.filas.reduce((s, f) => s + f.hl, 0)
  const totalChoferes = data.filas.filter((f) => f.chofer_id != null).length
  const sinAsignar = data.filas.find((f) => f.chofer_id == null)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                Bultos por chofer
              </CardTitle>
              <CardDescription>
                Ranking del período seleccionado, con TML y rechazos cruzados.
                Se asigna chofer al egreso de TML del día; fallback al mapeo
                nominal.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="desde" className="text-xs text-muted-foreground">
                  Desde
                </Label>
                <Input
                  id="desde"
                  type="date"
                  value={desdeStr}
                  onChange={(e) => setDesdeStr(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label htmlFor="hasta" className="text-xs text-muted-foreground">
                  Hasta
                </Label>
                <Input
                  id="hasta"
                  type="date"
                  value={hastaStr}
                  onChange={(e) => setHastaStr(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button size="sm" onClick={aplicarRango}>
                Aplicar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Choferes con entrega" value={formatInt(totalChoferes)} />
            <Kpi label="Bultos totales" value={formatInt(totalBultos)} />
            <Kpi label="HL totales" value={formatHl(totalHl)} />
            <Kpi
              label="Patentes sin resolver"
              value={formatInt(data.patentes_sin_resolver.length)}
              valueClass={
                data.patentes_sin_resolver.length > 0
                  ? "text-amber-700"
                  : "text-emerald-700"
              }
            />
          </div>

          {data.patentes_sin_resolver.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>
                  {data.patentes_sin_resolver.length} patente
                  {data.patentes_sin_resolver.length === 1 ? "" : "s"} sin chofer
                  asignado.
                </strong>{" "}
                Estas patentes vendieron en el período pero no tienen egreso
                de TML del día ni mapeo nominal:{" "}
                <span className="font-mono">
                  {data.patentes_sin_resolver.slice(0, 10).map((p) => etiquetaFletero(p)).join(", ")}
                  {data.patentes_sin_resolver.length > 10 ? "…" : ""}
                </span>
                . El supervisor debería cargarlas en seguridad o asignar el
                mapeo en{" "}
                <Link
                  href="/admin/mapeo-patente-chofer"
                  className="underline underline-offset-2"
                >
                  /admin/mapeo-patente-chofer
                </Link>
                .
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <ColHead label="Chofer" k="chofer_nombre" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} />
                  <ColHead label="Días" k="dias_trabajados" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} align="right" />
                  <ColHead label="Bultos" k="bultos" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} align="right" />
                  <ColHead label="HL" k="hl" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} align="right" />
                  <ColHead label="Viajes" k="viajes" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} align="right" />
                  <ColHead label="TML prom" k="tml_promedio" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} align="right" />
                  <ColHead label="% rechazo" k="rechazos_pct" sortKey={sortKey} sortDir={sortDir} onClick={clickHeader} align="right" />
                  <TableHead>Patentes</TableHead>
                  <TableHead className="w-24 text-center">Fuente</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground">
                      Sin choferes con datos en el período
                    </TableCell>
                  </TableRow>
                )}
                {filas.map((f, i) => {
                  const esSinAsignar = f.chofer_id == null
                  return (
                    <TableRow
                      key={f.chofer_id ?? `__none__|${f.chofer_nombre}`}
                      className={cn(
                        "cursor-pointer hover:bg-slate-50",
                        esSinAsignar && "bg-amber-50/40 hover:bg-amber-50",
                      )}
                      onClick={() => irADetalle(f)}
                    >
                      <TableCell className="text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        {limpiarNombreChofer(f.chofer_nombre)}
                        {esSinAsignar && (
                          <Badge
                            variant="outline"
                            className="ml-2 border-amber-300 text-amber-700"
                          >
                            sin chofer
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(f.dias_trabajados)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatInt(f.bultos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHl(f.hl)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(f.viajes)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          f.tml_promedio == null
                            ? "text-slate-400"
                            : f.tml_promedio <= 25
                              ? "text-emerald-700"
                              : "text-red-700",
                        )}
                      >
                        {f.tml_promedio == null ? "—" : `${f.tml_promedio} min`}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          f.rechazos_pct == null
                            ? "text-slate-400"
                            : f.rechazos_pct <= 1.7
                              ? "text-emerald-700"
                              : "text-red-700",
                        )}
                      >
                        {f.rechazos_pct == null
                          ? "—"
                          : `${f.rechazos_pct.toFixed(2)}%`}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {f.patentes_usadas.slice(0, 3).map((p) => etiquetaFletero(p)).join(", ")}
                        {f.patentes_usadas.length > 3
                          ? ` +${f.patentes_usadas.length - 3}`
                          : ""}
                      </TableCell>
                      <TableCell className="text-center">
                        <FuenteBadge fuente={f.fuente} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ColHead({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align,
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onClick: (k: SortKey) => void
  align?: "right"
}) {
  const active = sortKey === k
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none whitespace-nowrap hover:text-slate-900",
        align === "right" && "text-right",
      )}
      onClick={() => onClick(k)}
    >
      {label}
      {active && (
        <span className="ml-1 text-xs text-muted-foreground">
          {sortDir === "asc" ? "▲" : "▼"}
        </span>
      )}
    </TableHead>
  )
}

function FuenteBadge({ fuente }: { fuente: "tml" | "mapeo" | "mixto" }) {
  if (fuente === "tml") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        TML
      </Badge>
    )
  }
  if (fuente === "mapeo") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        Inferido
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-xs">
      Mixto
    </Badge>
  )
}

function Kpi({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums text-slate-900",
          valueClass,
        )}
      >
        {value}
      </div>
    </div>
  )
}

function valor(f: ChoferResumenRow, k: SortKey): string | number | null {
  switch (k) {
    case "chofer_nombre":
      return f.chofer_nombre
    case "bultos":
      return f.bultos
    case "hl":
      return f.hl
    case "viajes":
      return f.viajes
    case "dias_trabajados":
      return f.dias_trabajados
    case "tml_promedio":
      return f.tml_promedio
    case "rechazos_pct":
      return f.rechazos_pct
  }
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n)
}
function formatHl(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)
}

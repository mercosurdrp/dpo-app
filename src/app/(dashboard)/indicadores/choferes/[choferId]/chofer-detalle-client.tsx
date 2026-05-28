"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { Truck, ExternalLink } from "lucide-react"
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
import type { ChoferDetalle, ChoferDetalleDia } from "@/actions/choferes"

interface Props {
  data: ChoferDetalle
  desde: string
  hasta: string
}

export function ChoferDetalleClient({ data, desde, hasta }: Props) {
  const router = useRouter()
  const [desdeStr, setDesdeStr] = useState(desde)
  const [hastaStr, setHastaStr] = useState(hasta)

  function aplicarRango() {
    const params = new URLSearchParams()
    params.set("desde", desdeStr)
    params.set("hasta", hastaStr)
    const id = data.chofer_id ?? "sin-asignar"
    router.push(
      `/indicadores/choferes/${encodeURIComponent(id)}?${params.toString()}`,
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-600" />
                {data.chofer_nombre}
              </CardTitle>
              <CardDescription>
                Detalle de entregas en el período · {data.desde} → {data.hasta}
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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <Kpi
              label="Días trabajados"
              value={formatInt(data.kpis.dias_trabajados)}
            />
            <Kpi label="Bultos" value={formatInt(data.kpis.bultos)} />
            <Kpi label="HL" value={formatHl(data.kpis.hl)} sub="hectolitros" />
            <Kpi label="Viajes" value={formatInt(data.kpis.viajes)} />
            <Kpi
              label="TML promedio"
              value={
                data.kpis.tml_promedio == null
                  ? "—"
                  : `${data.kpis.tml_promedio} min`
              }
              valueClass={
                data.kpis.tml_promedio == null
                  ? "text-slate-400"
                  : data.kpis.tml_promedio <= 25
                    ? "text-emerald-700"
                    : "text-red-700"
              }
              sub="meta 25 min"
            />
            <Kpi
              label="% Rechazo"
              value={
                data.kpis.rechazos_pct == null
                  ? "—"
                  : `${data.kpis.rechazos_pct.toFixed(2)}%`
              }
              valueClass={
                data.kpis.rechazos_pct == null
                  ? "text-slate-400"
                  : data.kpis.rechazos_pct <= 1.7
                    ? "text-emerald-700"
                    : "text-red-700"
              }
              sub={`${formatInt(data.kpis.rechazos_bultos)} bultos`}
            />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Patentes</TableHead>
                  <TableHead className="w-24 text-right">Bultos</TableHead>
                  <TableHead className="w-24 text-right">HL</TableHead>
                  <TableHead className="w-20 text-right">Viajes</TableHead>
                  <TableHead className="w-24 text-right">TML</TableHead>
                  <TableHead className="w-28 text-right">Rechazos</TableHead>
                  <TableHead className="w-24 text-right">% Rech.</TableHead>
                  <TableHead className="w-24 text-center">Fuente</TableHead>
                  <TableHead className="w-12 text-center">Reunión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.por_dia.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-muted-foreground"
                    >
                      Sin entregas registradas para este chofer en el período.
                    </TableCell>
                  </TableRow>
                )}
                {data.por_dia.map((d) => (
                  <DiaRow key={d.fecha} dia={d} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function DiaRow({ dia }: { dia: ChoferDetalleDia }) {
  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell className="whitespace-nowrap font-mono text-xs">
        {dia.fecha}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {dia.patentes.join(", ")}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {formatInt(dia.bultos)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatHl(dia.hl)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatInt(dia.viajes)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums",
          dia.tml_minutos == null
            ? "text-slate-400"
            : dia.tml_minutos <= 25
              ? "text-emerald-700"
              : "text-red-700",
        )}
      >
        {dia.tml_minutos == null ? "—" : `${dia.tml_minutos} min`}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {dia.rechazos_bultos === 0 ? (
          <span className="text-slate-400">—</span>
        ) : (
          `${formatInt(dia.rechazos_bultos)} (${dia.rechazos_eventos})`
        )}
      </TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums",
          dia.rechazos_pct == null
            ? "text-slate-400"
            : dia.rechazos_pct <= 1.7
              ? "text-emerald-700"
              : "text-red-700",
        )}
      >
        {dia.rechazos_pct == null
          ? "—"
          : `${dia.rechazos_pct.toFixed(2)}%`}
      </TableCell>
      <TableCell className="text-center">
        <FuenteBadge fuente={dia.fuente} />
      </TableCell>
      <TableCell className="text-center">
        {dia.reunion_id ? (
          <Link
            href={`/reuniones/${dia.reunion_id}`}
            className="inline-flex items-center text-blue-600 hover:underline"
            title="Ver reunión del día"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
    </TableRow>
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
  sub,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
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
      {sub && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      )}
    </div>
  )
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

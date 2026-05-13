"use client"

import { useMemo, useState } from "react"
import { ArrowUpDown, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import type { RechazosAggVendedor } from "@/lib/types/rechazos"
import { formatBultos, formatMonto, formatTasa } from "@/lib/format/rechazos"

type SortKey = "tasa" | "bultos" | "monto" | "eventos"

export function RankingVendedores({
  por_vendedor,
  tasaPromedio,
}: {
  por_vendedor: RechazosAggVendedor[]
  tasaPromedio: number
}) {
  const [sortKey, setSortKey] = useState<SortKey>("tasa")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [showSinDenom, setShowSinDenom] = useState(false)

  const confiables = useMemo(
    () => por_vendedor.filter((v) => v.denominador_confiable),
    [por_vendedor],
  )
  const sinDenom = useMemo(
    () => por_vendedor.filter((v) => !v.denominador_confiable),
    [por_vendedor],
  )

  const sorted = useMemo(() => sortRows(confiables, sortKey, sortDir), [confiables, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortKey(k); setSortDir("desc") }
  }

  if (por_vendedor.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Sin datos de vendedores para este período.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Ranking de vendedores</h3>
          <span className="text-[11px] text-muted-foreground">
            Tasa promedio del período: <span className="font-medium text-slate-700">{formatTasa(tasaPromedio)}</span>
          </span>
        </div>

        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <ColHeader label="Bultos rech." k="bultos" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <TableHead className="text-right">Entregados</TableHead>
                  <ColHeader label="Tasa" k="tasa" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <ColHeader label="Monto" k="monto" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <ColHeader label="Eventos" k="eventos" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((v, i) => {
                  const aboveAvg = tasaPromedio > 0 && v.tasa > tasaPromedio
                  return (
                    <TableRow key={v.id_vendedor}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="font-medium text-slate-800">
                        {v.ds_vendedor}
                        <span className="ml-1 text-[10px] text-slate-400">[{v.id_vendedor}]</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBultos(v.bultos)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatBultos(v.total_entregados)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${aboveAvg ? "text-red-600" : "text-slate-700"}`}>
                        {formatTasa(v.tasa)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMonto(v.monto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBultos(v.eventos)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {sinDenom.length > 0 && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSinDenom((v) => !v)}
              className="h-7 gap-1.5 text-[11px] text-amber-700 hover:text-amber-800"
            >
              <Tooltip>
                <TooltipTrigger render={<AlertTriangle className="h-3 w-3 text-amber-500" />} />
                <TooltipContent className="max-w-[300px]">
                  Vendedores sin bultos entregados en el período (o más rechazados que entregados).
                  No tienen denominador confiable para calcular tasa — se muestran aparte.
                </TooltipContent>
              </Tooltip>
              {showSinDenom ? "Ocultar" : "Ver"} {sinDenom.length} vendedor{sinDenom.length > 1 ? "es" : ""} sin denominador confiable
            </Button>
            {showSinDenom && (
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Bultos rech.</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Eventos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sinDenom.map((v) => (
                      <TableRow key={v.id_vendedor}>
                        <TableCell className="font-medium text-slate-800">
                          {v.ds_vendedor}
                          <span className="ml-1 text-[10px] text-slate-400">[{v.id_vendedor}]</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatBultos(v.bultos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMonto(v.monto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBultos(v.eventos)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ColHeader({
  label, k, sortKey, sortDir, onClick, align,
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
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900 font-semibold" : "text-slate-500"}`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
        {active && <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>}
      </button>
    </TableHead>
  )
}

function sortRows(rows: RechazosAggVendedor[], key: SortKey, dir: "asc" | "desc"): RechazosAggVendedor[] {
  const sign = dir === "desc" ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = (a[key] as number) ?? 0
    const vb = (b[key] as number) ?? 0
    return (va - vb) * sign
  })
}

"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, AlertTriangle, ArrowUpDown } from "lucide-react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import type { RechazosAggChofer, TopVariacionDim } from "@/lib/types/rechazos"
import { formatBultos, formatHl, formatMonto, formatTasa } from "@/lib/format/rechazos"
import { etiquetaFletero } from "@/lib/gescom/etiqueta-fletero"

type SortKey = "hl" | "bultos" | "monto" | "tasa" | "eventos"
type DrillTo = { tipo: TopVariacionDim; id: string | number }

export function RankingChoferes({
  por_chofer,
  tasaPromedio,
  onDrillTo,
}: {
  por_chofer: { ranking_principal: RechazosAggChofer[]; ranking_sin_denominador: RechazosAggChofer[] }
  tasaPromedio: number
  onDrillTo?: (drillTo: DrillTo) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>("hl")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [showSinDenominador, setShowSinDenominador] = useState(false)

  const sorted = useMemo(() => sortChoferes(por_chofer.ranking_principal, sortKey, sortDir), [por_chofer.ranking_principal, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortKey(k); setSortDir("desc") }
  }

  const sinDenominador = por_chofer.ranking_sin_denominador

  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Ranking de choferes</h2>
          <p className="text-xs text-muted-foreground">
            Tasa por chofer (HL rechazados / HL entregados). Promedio del período: <span className="font-medium tabular-nums">{formatTasa(tasaPromedio)}</span>
          </p>
        </div>

        {sorted.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Sin datos en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36%]">Chofer / Patente</TableHead>
                  <SortableHead label="HL"       k="hl"       current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Bultos"   k="bultos"   current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Eventos"  k="eventos"  current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Monto"    k="monto"    current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Tasa"     k="tasa"     current={sortKey} dir={sortDir} onClick={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(c => {
                  const tasaAlta = tasaPromedio > 0 && c.tasa >= tasaPromedio * 2
                  return (
                    <TableRow
                      key={c.patente}
                      className={onDrillTo ? "cursor-pointer" : ""}
                      onClick={onDrillTo ? () => onDrillTo({ tipo: "chofer", id: c.patente }) : undefined}
                    >
                      <TableCell>
                        <div className="font-medium text-slate-900">{c.display}</div>
                        {c.chofer_nombre && (
                          <div className="text-[11px] text-muted-foreground">{etiquetaFletero(c.patente)}</div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium text-slate-900">{formatHl(c.hl)}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{formatBultos(c.bultos)}</TableCell>
                      <TableCell className="tabular-nums">{formatBultos(c.eventos)}</TableCell>
                      <TableCell className="tabular-nums">{formatMonto(c.monto)}</TableCell>
                      <TableCell className={`tabular-nums ${tasaAlta ? "font-semibold text-red-600" : ""}`}>
                        {formatTasa(c.tasa)}
                        {tasaAlta && (
                          <span className="ml-1 text-[10px]" title="Más del doble del promedio del fleet">⚠</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Bloque colapsable: choferes sin denominador */}
        {sinDenominador.length > 0 && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={() => setShowSinDenominador(s => !s)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <span className="font-medium text-slate-700">
                  {sinDenominador.length} {sinDenominador.length === 1 ? "chofer" : "choferes"} sin denominador comparable
                </span>
                <Tooltip>
                  <TooltipTrigger render={<span className="cursor-help text-muted-foreground">ⓘ</span>} />
                  <TooltipContent className="max-w-[300px]">
                    La patente entregó menos HL de los que rechazó (o no aparece en ventas_diarias).
                    Su tasa no es comparable contra el promedio del fleet. Excluida de alertas y rankings de tasa.
                  </TooltipContent>
                </Tooltip>
              </span>
              {showSinDenominador
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {showSinDenominador && (
              <div className="border-t border-slate-200 p-3 overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patente</TableHead>
                      <TableHead>HL</TableHead>
                      <TableHead>Bultos</TableHead>
                      <TableHead>Eventos</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Entreg. HL</TableHead>
                      <TableHead className="w-[32%]">Top motivos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sinDenominador.map(c => (
                      <TableRow
                        key={c.patente}
                        className={onDrillTo ? "cursor-pointer" : ""}
                        onClick={onDrillTo ? () => onDrillTo({ tipo: "chofer", id: c.patente }) : undefined}
                      >
                        <TableCell className="font-medium">{c.display}</TableCell>
                        <TableCell className="tabular-nums font-medium text-slate-900">{formatHl(c.hl)}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatBultos(c.bultos)}</TableCell>
                        <TableCell className="tabular-nums">{formatBultos(c.eventos)}</TableCell>
                        <TableCell className="tabular-nums">{formatMonto(c.monto)}</TableCell>
                        <TableCell className="tabular-nums text-amber-700">{formatHl(c.total_hl_entregados)}</TableCell>
                        <TableCell className="text-[11px]">
                          {c.motivos_top?.length ? (
                            <ul className="space-y-0.5">
                              {c.motivos_top.map(m => (
                                <li key={m.ds_rechazo} className="flex items-center justify-between gap-2">
                                  <span className="truncate text-slate-700">{m.ds_rechazo}</span>
                                  <span className="tabular-nums text-muted-foreground">{formatMonto(m.monto)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
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

function sortChoferes(arr: RechazosAggChofer[], key: SortKey, dir: "desc" | "asc"): RechazosAggChofer[] {
  const sign = dir === "desc" ? -1 : 1
  return [...arr].sort((a, b) => sign * (a[key] - b[key]))
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

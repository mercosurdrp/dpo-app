"use client"

import { useMemo, useState } from "react"
import { ArrowUpDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { RechazosAggProducto, TopVariacionDim } from "@/lib/types/rechazos"
import { formatBultos, formatHl, formatMonto } from "@/lib/format/rechazos"

type SortKey = "hl" | "bultos" | "monto" | "eventos"
type DrillTo = { tipo: TopVariacionDim; id: string | number }

const DEFAULT_LIMIT = 10
const EXPANDED_LIMIT = 50

export function RankingProductos({
  por_producto,
  onDrillTo,
}: {
  por_producto: RechazosAggProducto[]
  onDrillTo?: (drillTo: DrillTo) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>("hl")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(() => {
    const sign = sortDir === "desc" ? -1 : 1
    return [...por_producto].sort((a, b) => sign * (a[sortKey] - b[sortKey]))
  }, [por_producto, sortKey, sortDir])

  const limit = expanded ? EXPANDED_LIMIT : DEFAULT_LIMIT
  const visible = sorted.slice(0, limit)
  const totalCount = por_producto.length

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "desc" ? "asc" : "desc")
    else { setSortKey(k); setSortDir("desc") }
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="p-3 md:p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Top productos</h2>
          <p className="text-xs text-muted-foreground">
            {totalCount} SKU{totalCount === 1 ? "" : "s"} rechazado{totalCount === 1 ? "" : "s"} en el período
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Sin productos en el período</div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44%]">Producto</TableHead>
                  <SortableHead label="HL"      k="hl"      current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Bultos"  k="bultos"  current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Eventos" k="eventos" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableHead label="Monto"   k="monto"   current={sortKey} dir={sortDir} onClick={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(p => (
                  <TableRow
                    key={p.id_articulo}
                    className={onDrillTo ? "cursor-pointer" : ""}
                    onClick={onDrillTo ? () => onDrillTo({ tipo: "producto", id: p.id_articulo }) : undefined}
                  >
                    <TableCell>
                      <div className="font-medium text-slate-900">{p.ds_articulo}</div>
                      <div className="text-[11px] text-muted-foreground">ID {p.id_articulo}</div>
                    </TableCell>
                    <TableCell className="tabular-nums font-medium text-slate-900">{formatHl(p.hl)}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{formatBultos(p.bultos)}</TableCell>
                    <TableCell className="tabular-nums">{formatBultos(p.eventos)}</TableCell>
                    <TableCell className="tabular-nums">{formatMonto(p.monto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {totalCount > limit && (
          <div className="mt-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(true)} className="h-7 text-xs">
              Ver más ({totalCount - limit} restantes)
            </Button>
          </div>
        )}
        {expanded && totalCount > EXPANDED_LIMIT && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            Mostrando top {EXPANDED_LIMIT} de {totalCount}. Aplicá filtros para ver más.
          </p>
        )}
      </CardContent>
    </Card>
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

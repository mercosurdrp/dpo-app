"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, FileText } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getRechazosDetalle } from "@/actions/rechazos-detalle"
import type {
  RechazosDetalleResponse,
  RechazosDetalleRow,
  RechazosFilters,
  TopVariacionDim,
} from "@/lib/types/rechazos"
import { formatBultos, formatFecha, formatHl, formatMonto } from "@/lib/format/rechazos"

export interface DrillTo {
  tipo: TopVariacionDim
  id: string | number
  /** Etiqueta lista para mostrar en el título del Sheet ("ERROR DE DISTRIBUCIÓN", "AF469UR", etc). */
  label?: string
}

const PAGE_SIZE = 100

export function DrillDownSheet({
  open,
  onOpenChange,
  drillTo,
  desde,
  hasta,
  filters,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  drillTo: DrillTo | null
  desde: string
  hasta: string
  filters?: RechazosFilters
}) {
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState<RechazosDetalleResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [side, setSide] = useState<"right" | "bottom">("right")

  // Sheet: bottom en mobile (más natural para touch), right en desktop.
  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia("(max-width: 767px)")
    const apply = (matches: boolean) => setSide(matches ? "bottom" : "right")
    apply(mql.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [])

  // Refetch cuando se abre el Sheet o cambia drill/filters/rango
  useEffect(() => {
    if (!open || !drillTo) return
    setError(null)
    setData(null)
    startTransition(async () => {
      try {
        const res = await getRechazosDetalle({
          desde, hasta, filters,
          drill: { tipo: drillTo.tipo, value: drillTo.id },
          offset: 0,
          limit: PAGE_SIZE,
        })
        setData(res)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, drillTo?.tipo, drillTo?.id, desde, hasta, JSON.stringify(filters ?? {})])

  const loadMore = () => {
    if (!data || !drillTo) return
    const nextOffset = data.offset + data.rows.length
    if (nextOffset >= data.total) return
    startTransition(async () => {
      try {
        const more = await getRechazosDetalle({
          desde, hasta, filters,
          drill: { tipo: drillTo.tipo, value: drillTo.id },
          offset: nextOffset,
          limit: PAGE_SIZE,
        })
        setData(prev => prev ? { ...more, rows: [...prev.rows, ...more.rows], offset: 0 } : more)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const title = drillTo ? buildTitle(drillTo) : "Detalle"
  const subtitle = `Período: ${formatFecha(desde)} → ${formatFecha(hasta)}`
  const remaining = data ? Math.max(0, data.total - data.rows.length) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={
          side === "right"
            ? "flex w-full flex-col gap-0 p-0 sm:max-w-3xl md:max-w-4xl"
            : "flex h-[85vh] flex-col gap-0 p-0"
        }
      >
        <SheetHeader className="border-b border-slate-200 p-4">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="text-xs">
            {subtitle}
            {data && (
              <span className="ml-2">· <span className="font-medium tabular-nums text-slate-700">{formatBultos(data.total)}</span> rechazo{data.total === 1 ? "" : "s"} total</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {!data && !error && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando detalle…
            </div>
          )}

          {data && data.rows.length === 0 && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <FileText className="mr-2 h-4 w-4" />
              Sin filas para los filtros aplicados.
            </div>
          )}

          {data && data.rows.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {data.rows.map(r => <DetalleRowItem key={r.id} row={r} />)}
            </ul>
          )}
        </div>

        {data && remaining > 0 && (
          <div className="border-t border-slate-200 p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Cargando…</>
              ) : (
                <>Cargar {Math.min(remaining, PAGE_SIZE)} más ({remaining} restantes)</>
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function buildTitle(drill: DrillTo): string {
  const labelOrId = drill.label ?? String(drill.id)
  switch (drill.tipo) {
    case "motivo":   return `Detalle del motivo: ${labelOrId}`
    case "chofer":   return `Detalle del chofer: ${labelOrId}`
    case "canal":    return `Detalle del canal: ${labelOrId}`
    case "cliente":  return `Detalle del cliente: ${labelOrId}`
    case "producto": return `Detalle del producto: ${labelOrId}`
    default:         return `Detalle: ${labelOrId}`
  }
}

function DetalleRowItem({ row }: { row: RechazosDetalleRow }) {
  return (
    <li className="space-y-1 px-4 py-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums text-slate-900">
          {formatFecha(row.fecha_venta)}
          {row.fecha !== row.fecha_venta && (
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">
              dev. {formatFecha(row.fecha)}
            </span>
          )}
        </span>
        <span className="tabular-nums font-medium text-slate-900">
          {row.monto_neto != null ? formatMonto(row.monto_neto) : <span className="text-muted-foreground">—</span>}
        </span>
      </div>
      <div className="text-slate-700">
        <span className="font-medium">{row.chofer_display}</span>
        {row.chofer_display !== row.patente && (
          <span className="ml-1 text-muted-foreground">· {row.patente}</span>
        )}
      </div>
      <div className="text-slate-700 truncate" title={row.nombre_cliente ?? ""}>
        {row.nombre_cliente ?? "(sin cliente)"}
        {row.id_cliente && <span className="ml-1 text-muted-foreground">#{row.id_cliente}</span>}
      </div>
      <div className="truncate text-slate-600" title={row.ds_articulo}>
        {row.ds_articulo}
        <span className="ml-1 text-muted-foreground">#{row.id_articulo}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Badge variant="outline" className="border-slate-300 text-[10px] font-normal text-slate-700">
          {row.ds_rechazo}
        </Badge>
        <Badge variant="outline" className="border-slate-200 text-[10px] font-normal text-muted-foreground">
          {row.categoria}{row.controlable ? " · controlable" : ""}
        </Badge>
        <span className="ml-auto tabular-nums">
          <span className="font-medium text-slate-700">{formatHl(row.hl_rechazados)}</span>
          <span className="ml-1 text-muted-foreground">· {formatBultos(row.bultos_rechazados)} bultos</span>
        </span>
      </div>
      {(row.ds_localidad || row.ds_canal_mkt || row.ds_supervisor) && (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[10px] text-muted-foreground">
          {row.ds_localidad && <span>📍 {row.ds_localidad}</span>}
          {row.ds_canal_mkt && <span>🛒 {row.ds_canal_mkt}</span>}
          {row.ds_supervisor && <span>👤 {row.ds_supervisor}</span>}
        </div>
      )}
    </li>
  )
}

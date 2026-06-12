"use client"

import { useEffect, useState, type ComponentProps } from "react"
import { Loader2 } from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatBultos, formatFecha } from "@/lib/format/rechazos"
import { getBultosPorDia, type BultosPorDia } from "@/actions/bultos-por-dia"
import { BultosPatentesDiaDialog } from "./bultos-patentes-dia-dialog"

/** Firma exacta del onClick del chart en la versión de recharts instalada. */
type ChartClickHandler = NonNullable<ComponentProps<typeof BarChart>["onClick"]>

const COLOR_CHESS = "#0284c7" // sky-600 — mismo par de colores que los badges de origen
const COLOR_GESTION = "#d97706" // amber-600

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  desde: string
  hasta: string
}

export function BultosDiaDialog({ open, onOpenChange, desde, hasta }: Props) {
  const [data, setData] = useState<BultosPorDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drillFecha, setDrillFecha] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setData(null)
      setError(null)
      setDrillFecha(null)
      return
    }
    let cancelado = false
    setLoading(true)
    setError(null)
    void getBultosPorDia(desde, hasta).then((res) => {
      if (cancelado) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancelado = true
    }
  }, [open, desde, hasta])

  const points = (data?.puntos ?? []).map((p) => ({
    ...p,
    label: formatFechaShortDM(p.fecha),
  }))

  // recharts 3.x: el onClick del chart entrega activeTooltipIndex/activeIndex
  // (NO activePayload, que era de la 2.x) → se indexa el array local.
  const handleChartClick: ChartClickHandler = (state) => {
    if (!state) return
    const idx = Number(state.activeTooltipIndex ?? state.activeIndex)
    const p = Number.isInteger(idx) && idx >= 0 ? points[idx] : undefined
    if (p) setDrillFecha(p.fecha)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1100px] overflow-y-auto sm:max-w-[95vw] lg:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>Bultos por día · Chess vs Gestión</DialogTitle>
          <DialogDescription>
            {formatFecha(desde)} – {formatFecha(hasta)} · entregados y rechazados por origen — los rechazos se atribuyen al día del reparto (no al día en que se registró la devolución)
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando serie…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiMini
                label="Entregados Chess"
                value={formatBultos(data.total_chess)}
                color={COLOR_CHESS}
              />
              <KpiMini
                label="Entregados Gestión"
                value={formatBultos(data.total_gestion)}
                color={COLOR_GESTION}
              />
              <KpiMini
                label="Rechazados Chess"
                value={formatBultos(data.total_chess_rechazados)}
                color={COLOR_CHESS}
              />
              <KpiMini
                label="Rechazados Gestión"
                value={formatBultos(data.total_gestion_rechazados)}
                color={COLOR_GESTION}
              />
            </div>

            {points.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                Sin datos en el período
              </div>
            ) : (
              <>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    Bultos entregados por día
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      tocá una columna para ver los camiones
                    </span>
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={points}
                      margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                      onClick={handleChartClick}
                      className="cursor-pointer"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={48} />
                      <Tooltip
                        formatter={(v, name) => [formatBultos(Number(v ?? 0)), String(name)]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="chess" name="Chess" stackId="e" fill={COLOR_CHESS} />
                      <Bar
                        dataKey="gestion"
                        name="Gestión"
                        stackId="e"
                        fill={COLOR_GESTION}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    Bultos rechazados por día
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      tocá una columna para ver los camiones
                    </span>
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={points}
                      margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                      onClick={handleChartClick}
                      className="cursor-pointer"
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={48} />
                      <Tooltip
                        formatter={(v, name) => [formatBultos(Number(v ?? 0)), String(name)]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="chess_rechazados"
                        name="Chess"
                        stackId="r"
                        fill={COLOR_CHESS}
                      />
                      <Bar
                        dataKey="gestion_rechazados"
                        name="Gestión"
                        stackId="r"
                        fill={COLOR_GESTION}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            <div className="flex justify-end border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}

        <BultosPatentesDiaDialog
          open={drillFecha != null}
          onOpenChange={(o) => { if (!o) setDrillFecha(null) }}
          fecha={drillFecha}
        />
      </DialogContent>
    </Dialog>
  )
}

function KpiMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-block size-2 rounded-sm" style={{ backgroundColor: color }} />
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}

function formatFechaShortDM(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`
}

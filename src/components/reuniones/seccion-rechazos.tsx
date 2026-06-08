"use client"

import { useEffect, useState } from "react"
import { PackageX, Loader2, Maximize2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatHl } from "@/lib/format/rechazos"
import {
  getRechazosResumenDia,
  type RechazosResumenDia,
} from "@/actions/rechazos-resumen-dia"
import { RechazosDetalleDiaDialog } from "./rechazos-detalle-dia-dialog"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

// Meta de tasa de rechazo (HL). Mismo umbral que el detalle del día.
const META_TASA = 1.7

// Clave de sección para el action log (debe coincidir con el filtro en el detalle).
export const SECCION_RECHAZOS = "rechazos"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

/**
 * Sección "Rechazos" de la Reunión Ventas-Logística.
 * Trae datos reales del día (tabla rechazos): % de rechazo, bultos rechazados
 * y desglose por motivos. La fecha arranca en la fecha de la reunión y se puede
 * filtrar a una fecha anterior. "Ver detalle completo" abre el drill-down
 * (clientes / productos / patentes) reutilizando el diálogo existente.
 * Incluye su propio Action Log acotado a la sección.
 */
export function SeccionRechazos({
  fechaReunion,
  reunionId,
  actividades,
  responsables,
  puedeEditar,
  onActividadesChanged,
}: {
  fechaReunion: string
  reunionId: string
  actividades: ReunionActividadConResponsable[]
  responsables: ResponsableOpt[]
  puedeEditar: boolean
  onActividadesChanged: () => void
}) {
  const [fecha, setFecha] = useState(fechaReunion)
  const [data, setData] = useState<RechazosResumenDia | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    void getRechazosResumenDia(fecha).then((res) => {
      if (cancel) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [fecha])

  const tasa = data?.kpis.tasa ?? null
  const cumple = tasa != null && tasa <= META_TASA
  const esOtraFecha = fecha !== fechaReunion

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-amber-900">
          <PackageX className="size-5 text-amber-600" />
          Rechazos
          {esOtraFecha && (
            <Badge variant="outline" className="text-[10px] font-normal">
              fecha anterior
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="rechazos-fecha">
            Día
          </label>
          <input
            id="rechazos-fecha"
            type="date"
            value={fecha}
            max={fechaReunion}
            onChange={(e) => setFecha(e.target.value || fechaReunion)}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando rechazos…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* KPIs principales: % de rechazo + bultos rechazados */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="% de rechazo (HL)"
                value={tasa == null ? "—" : `${tasa.toFixed(2)}%`}
                valueClassName={
                  tasa == null
                    ? "text-slate-400"
                    : cumple
                      ? "text-emerald-700"
                      : "text-red-700"
                }
                sub={
                  tasa == null
                    ? "sin ventas del día"
                    : `${cumple ? "cumple" : "supera"} meta ${META_TASA}%` +
                      (data.kpis.tasa_bultos == null
                        ? ""
                        : ` · bultos ${data.kpis.tasa_bultos.toFixed(2)}%`)
                }
              />
              <KpiCard
                label="Bultos rechazados"
                value={formatInt(data.kpis.bultos_rechazados)}
                sub={`${formatInt(data.kpis.ventas_total_bultos)} bultos entregados`}
              />
              <KpiCard
                label="HL rechazados"
                value={formatHl(data.kpis.hl_rechazados)}
                sub={`${formatInt(data.kpis.eventos)} eventos · ${formatInt(
                  data.kpis.patentes_con_rechazo,
                )} patentes`}
              />
              <KpiCard
                label="HL entregados"
                value={formatHl(data.kpis.ventas_total_hl)}
                sub="total del día"
              />
            </div>

            {/* Por motivos */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Rechazos por motivo
                </h3>
                <span className="text-xs text-muted-foreground">
                  Top {data.top_motivos.length}
                </span>
              </div>
              <div className="rounded-md border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="w-24 text-right">Bultos</TableHead>
                      <TableHead className="w-24 text-right">HL</TableHead>
                      <TableHead className="w-20 text-right">Eventos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top_motivos.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-muted-foreground"
                        >
                          Sin rechazos para este día
                        </TableCell>
                      </TableRow>
                    )}
                    {data.top_motivos.map((m, i) => (
                      <TableRow key={m.id_rechazo}>
                        <TableCell className="text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {m.ds_rechazo}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {prettyCategoria(m.categoria)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatInt(m.bultos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatHl(m.hl)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(m.eventos)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                <Maximize2 className="mr-1.5 size-4" />
                Ver detalle completo
              </Button>
            </div>
          </>
        )}

        {/* Action Log acotado a Rechazos */}
        <ActionLogSeccion
          reunionId={reunionId}
          reunionTipo="logistica-ventas"
          seccion={SECCION_RECHAZOS}
          titulo="Rechazos"
          actividades={actividades}
          responsables={responsables}
          puedeEditar={puedeEditar}
          onChanged={onActividadesChanged}
        />
      </CardContent>

      <RechazosDetalleDiaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fecha={fecha}
      />
    </Card>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          valueClassName ?? "text-slate-900",
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

function prettyCategoria(c: string): string {
  return c
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase())
}

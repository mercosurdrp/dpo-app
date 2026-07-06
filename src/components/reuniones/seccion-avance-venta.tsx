"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import { Loader2, RefreshCw, TrendingUp, Target, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  getAvanceVentaData,
  actualizarDesdeAvanceVenta,
  type AvanceVentaData,
} from "@/actions/reuniones-avance-venta"
import { ActionLogSeccion } from "./action-log-seccion"
import type { ReunionActividadConResponsable } from "@/types/database"

export const SECCION_AVANCE_VENTA = "avance_venta"

interface ResponsableOpt {
  id: string
  nombre: string
  email: string
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
]

function formatHl(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n) + " HL"
}
function formatPct(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n) + "%"
}
function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y.slice(2)}`
}

// Color por proyección a fin de mes vs. objetivo (semáforo de "cómo venimos").
function colorProy(tend: number, obj: number): string {
  if (obj <= 0) return "text-slate-900"
  const p = (tend / obj) * 100
  if (p >= 100) return "text-emerald-600"
  if (p >= 90) return "text-amber-600"
  return "text-red-600"
}

export function SeccionAvanceVenta({
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
  // Mes/año por defecto: el de la fecha de la reunión (YYYY-MM).
  const [periodo, setPeriodo] = useState(fechaReunion.slice(0, 7))
  const [data, setData] = useState<AvanceVentaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendiente, startPend] = useTransition()
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancel = false
    void getAvanceVentaData(reunionId).then((res) => {
      if (cancel) return
      if ("error" in res) {
        toast.error(res.error)
        setData(null)
      } else {
        setData(res.data)
        const snap = res.data.snapshot
        if (snap) setPeriodo(`${snap.anio}-${String(snap.mes).padStart(2, "0")}`)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [reunionId, reload])

  const snap = data?.snapshot ?? null
  const comp = data?.comparacion ?? null
  // Ritmo esperado = % del mes (en peso de días hábiles) ya transcurrido.
  const ritmo =
    snap && snap.peso_habiles > 0
      ? (snap.peso_trabajados / snap.peso_habiles) * 100
      : 0

  function actualizar() {
    const [y, m] = periodo.split("-").map(Number)
    if (!y || !m) {
      toast.error("Elegí un mes válido")
      return
    }
    startPend(async () => {
      const res = await actualizarDesdeAvanceVenta(reunionId, y, m)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(
        `Avance actualizado · ${formatHl(res.data.real_total_hl)} (${formatPct(
          res.data.pct_avance_total,
        )})`,
      )
      setReload((k) => k + 1)
    })
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-emerald-900">
          <TrendingUp className="size-5 text-emerald-600" />
          Avance de Venta — Acumulado empresa
          {snap && (
            <Badge variant="outline" className="text-[10px] font-normal">
              {MESES[snap.mes - 1]} {snap.anio} · al {formatFecha(snap.hasta)}
            </Badge>
          )}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">Mes</label>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value || fechaReunion.slice(0, 7))}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm"
          />
          {puedeEditar && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={actualizar}
              disabled={pendiente}
              title="Trae el acumulado de venta del dashboard Mercosur y lo congela en la reunión"
            >
              {pendiente ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-3.5" />
              )}
              Actualizar desde dashboard
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando avance de venta…
          </div>
        ) : !snap ? (
          <div className="rounded-md border border-dashed border-emerald-300 bg-white py-8 text-center text-sm text-muted-foreground">
            Sin avance cargado. Elegí el mes y usá{" "}
            <span className="font-medium">&ldquo;Actualizar desde dashboard&rdquo;</span>{" "}
            para traer el acumulado de venta.
          </div>
        ) : (
          <>
            {!snap.objetivo_disponible && (
              <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="size-4 shrink-0" />
                El objetivo de {MESES[snap.mes - 1]} {snap.anio} todavía no está cerrado
                en PAV. El % de avance y la tendencia se muestran solo cuando el objetivo
                esté disponible.
              </div>
            )}

            {/* KPIs totales */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Objetivo del mes"
                value={snap.objetivo_disponible ? formatHl(snap.objetivo_total_hl) : "—"}
                sub="HL totales empresa"
                icon={<Target className="size-3.5 text-emerald-600" />}
              />
              <KpiCard
                label="Real acumulado"
                value={formatHl(snap.real_total_hl)}
                sub={`${formatPct(ritmo)} del mes transcurrido`}
              />
              <KpiCard
                label="Tendencia fin de mes"
                value={formatHl(snap.tendencia_total_hl)}
                sub={
                  snap.objetivo_disponible
                    ? `${formatPct((snap.tendencia_total_hl / (snap.objetivo_total_hl || 1)) * 100)} del objetivo`
                    : "proyección"
                }
                valueClassName={colorProy(snap.tendencia_total_hl, snap.objetivo_total_hl)}
              />
              <KpiCard
                label="% Avance"
                value={snap.objetivo_disponible ? formatPct(snap.pct_avance_total) : "—"}
                sub={
                  comp
                    ? `antes ${formatPct(comp.anterior_pct_avance_total)} (${formatFecha(comp.anterior_fecha)})`
                    : "real / objetivo"
                }
                valueClassName={colorProy(snap.tendencia_total_hl, snap.objetivo_total_hl)}
              />
            </div>

            {/* Detalle por categoría */}
            <div className="rounded-md border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Objetivo</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead className="text-right">Tendencia</TableHead>
                    <TableHead className="w-24 text-right">% Avance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snap.detalle.map((c) => (
                    <TableRow key={c.categoria}>
                      <TableCell className="font-medium">{c.categoria}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {snap.objetivo_disponible ? formatHl(c.objetivo_hl) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHl(c.real_hl)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          colorProy(c.tendencia_hl, c.objetivo_hl),
                        )}
                      >
                        {formatHl(c.tendencia_hl)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-semibold",
                          colorProy(c.tendencia_hl, c.objetivo_hl),
                        )}
                      >
                        {snap.objetivo_disponible ? formatPct(c.pct_avance) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 bg-emerald-50/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {snap.objetivo_disponible ? formatHl(snap.objetivo_total_hl) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHl(snap.real_total_hl)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        colorProy(snap.tendencia_total_hl, snap.objetivo_total_hl),
                      )}
                    >
                      {formatHl(snap.tendencia_total_hl)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        colorProy(snap.tendencia_total_hl, snap.objetivo_total_hl),
                      )}
                    >
                      {snap.objetivo_disponible ? formatPct(snap.pct_avance_total) : "—"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Volumen en HL · igual que &quot;Resumen Ventas&quot; del dashboard (venta Chess
              por unidad de negocio, todos los fletes) · tendencia ponderada por días
              hábiles (L-V=1, S=0,5). Fuente: dashboard Mercosur Pampeana.
            </p>

            {/* Action Log de la sección */}
            <ActionLogSeccion
              reunionId={reunionId}
              reunionTipo="logistica-ventas"
              seccion={SECCION_AVANCE_VENTA}
              titulo="Avance de Venta"
              actividades={actividades}
              responsables={responsables}
              puedeEditar={puedeEditar}
              onChanged={onActividadesChanged}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function KpiCard({
  label,
  value,
  sub,
  valueClassName,
  icon,
}: {
  label: string
  value: string
  sub?: string
  valueClassName?: string
  icon?: ReactNode
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", valueClassName ?? "text-slate-900")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { ClipboardList, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ReporteDetalleDialog } from "@/components/reportes-seguridad/reporte-detalle-dialog"
import {
  getReportePlanesTablero,
  type PlanTableroFila,
  type PlanTableroEstado,
} from "@/actions/reportes-planes-tablero"
import { deleteReportePlan } from "@/actions/reportes-seguridad"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_TIPO_COLORS,
  type ReporteSeguridadTipo,
  type UserRole,
} from "@/types/database"

// Mismas helpers que el resto del módulo
function formatDate(iso: string | null): string {
  if (!iso) return "—"
  // Si viene fecha pura YYYY-MM-DD, evitar corrimiento por timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-")
    return `${d}/${m}/${y}`
  }
  // timestamptz — formateamos a dd/MM/yyyy local
  try {
    const dt = new Date(iso)
    if (Number.isNaN(dt.getTime())) return iso
    const dd = String(dt.getDate()).padStart(2, "0")
    const mm = String(dt.getMonth() + 1).padStart(2, "0")
    const yyyy = dt.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  } catch {
    return iso
  }
}

const ESTADO_LABELS: Record<PlanTableroEstado, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminado: "Terminado",
}

const ESTADO_CLASSES: Record<PlanTableroEstado, string> = {
  pendiente: "bg-slate-100 text-slate-700",
  en_curso: "bg-amber-100 text-amber-700",
  terminado: "bg-emerald-100 text-emerald-700",
}

const ESTADOS: (PlanTableroEstado | "all")[] = [
  "all",
  "pendiente",
  "en_curso",
  "terminado",
]

interface Props {
  currentProfileId: string
  currentRole: UserRole
}

export function PlanesTablero({ currentProfileId, currentRole }: Props) {
  const [filas, setFilas] = useState<PlanTableroFila[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  const [filtroEstado, setFiltroEstado] = useState<PlanTableroEstado | "all">("all")
  const [filtroResponsable, setFiltroResponsable] = useState<string>("all")

  const [detalleReporteId, setDetalleReporteId] = useState<string | null>(null)
  const [borrandoId, setBorrandoId] = useState<string | null>(null)
  const [, startDelete] = useTransition()

  const isAdmin = currentRole === "admin"

  function handleBorrarPlan(reporteId: string) {
    if (!confirm("¿Eliminar el plan de acción? El reporte no se borra.")) return
    setBorrandoId(reporteId)
    startDelete(async () => {
      const res = await deleteReportePlan(reporteId)
      setBorrandoId(null)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Plan de acción eliminado")
      setReloadKey((k) => k + 1)
    })
  }

  useEffect(() => {
    let cancelled = false
    getReportePlanesTablero().then((res) => {
      if (cancelled) return
      if ("error" in res) {
        toast.error(res.error)
        setFilas([])
      } else {
        setFilas(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  // Lista única de responsables presentes en los datos
  const responsables = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of filas ?? []) {
      if (f.responsable_id && f.responsable_nombre) {
        map.set(f.responsable_id, f.responsable_nombre)
      }
    }
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [filas])

  const filtradas = useMemo(() => {
    return (filas ?? []).filter((f) => {
      if (filtroEstado !== "all" && f.estado !== filtroEstado) return false
      if (filtroResponsable !== "all" && f.responsable_id !== filtroResponsable) {
        return false
      }
      return true
    })
  }, [filas, filtroEstado, filtroResponsable])

  // KPIs rápidos
  const kpis = useMemo(() => {
    const base = { total: 0, pendiente: 0, en_curso: 0, terminado: 0 }
    for (const f of filas ?? []) {
      base.total += 1
      base[f.estado] += 1
    }
    return base
  }, [filas])

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.total}</p>
        </div>
        <div
          className="rounded-lg border bg-card p-3"
          style={{ borderLeft: "4px solid #64748b" }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pendiente
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.pendiente}</p>
        </div>
        <div
          className="rounded-lg border bg-card p-3"
          style={{ borderLeft: "4px solid #F59E0B" }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            En curso
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.en_curso}</p>
        </div>
        <div
          className="rounded-lg border bg-card p-3"
          style={{ borderLeft: "4px solid #10b981" }}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Terminado
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpis.terminado}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Estado</Label>
          <Select
            value={filtroEstado}
            onValueChange={(v) =>
              setFiltroEstado((v ?? "all") as PlanTableroEstado | "all")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e === "all" ? "Todos" : ESTADO_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Responsable</Label>
          <Select
            value={filtroResponsable}
            onValueChange={(v) => setFiltroResponsable(v ?? "all")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {responsables.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-card">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-60">Reporte</TableHead>
                <TableHead>Plan de acción</TableHead>
                <TableHead className="w-40">Responsable</TableHead>
                <TableHead className="w-32">F. planificada</TableHead>
                <TableHead className="w-32">F. completado</TableHead>
                <TableHead className="w-28">Estado</TableHead>
                <TableHead className="w-24 text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                    Cargando planes…
                  </TableCell>
                </TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <ClipboardList className="mx-auto mb-2 size-6 text-muted-foreground/50" />
                    No hay planes para estos filtros.
                  </TableCell>
                </TableRow>
              ) : (
                filtradas.map((f) => {
                  const reporteTipo = f.reporte_tipo as ReporteSeguridadTipo | null
                  const reporteColor = reporteTipo
                    ? REPORTE_SEGURIDAD_TIPO_COLORS[reporteTipo]
                    : "#64748b"
                  const reporteLabel = reporteTipo
                    ? REPORTE_SEGURIDAD_TIPO_LABELS[reporteTipo]
                    : "—"
                  return (
                    <TableRow key={f.id} className="align-top">
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              {formatDate(f.reporte_fecha)}
                            </span>
                            <Badge
                              variant="secondary"
                              style={{
                                backgroundColor: reporteColor + "20",
                                color: reporteColor,
                              }}
                              className="text-[10px]"
                            >
                              {reporteLabel}
                            </Badge>
                          </div>
                          <p className="line-clamp-2 text-xs text-slate-700">
                            {f.reporte_descripcion ?? "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-pre-wrap text-sm text-slate-800">
                          {f.plan_descripcion || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {f.responsable_nombre ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(f.fecha_planificada)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(f.fecha_completado)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={ESTADO_CLASSES[f.estado]}
                        >
                          {ESTADO_LABELS[f.estado]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setDetalleReporteId(f.reporte_id)}
                          >
                            Ver
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleBorrarPlan(f.reporte_id)}
                              disabled={borrandoId === f.reporte_id}
                              title="Eliminar el plan de acción (no borra el reporte)"
                            >
                              {borrandoId === f.reporte_id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="size-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog detalle reporte (mismo dialog que la lista de reportes) */}
      {detalleReporteId && (
        <ReporteDetalleDialog
          key={detalleReporteId}
          reporteId={detalleReporteId}
          open={true}
          onOpenChange={(v) => {
            if (!v) {
              setDetalleReporteId(null)
              // Refrescamos por si el admin marcó completado, editó o borró el plan.
              setReloadKey((k) => k + 1)
            }
          }}
          currentProfileId={currentProfileId}
          currentRole={currentRole}
        />
      )}
    </div>
  )
}

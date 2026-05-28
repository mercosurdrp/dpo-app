"use client"

import { useEffect, useMemo, useState } from "react"
import { ClipboardList, Loader2, Wrench } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ReporteDetalleDialog } from "@/components/reportes-seguridad/reporte-detalle-dialog"
import { HerramientaGestionView } from "@/components/herramientas-gestion/herramienta-gestion-view"
import { HERRAMIENTA_GESTION_LABELS } from "@/lib/herramientas-gestion"
import {
  getReportePlanesTablero,
  type PlanTableroFila,
  type PlanTableroEstado,
  type PlanTableroFuente,
} from "@/actions/reportes-planes-tablero"
import { getHerramientaGestion } from "@/actions/herramientas-gestion"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_TIPO_COLORS,
  type ReporteSeguridadTipo,
  type HerramientaGestionConContexto,
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

const FUENTE_LABELS: Record<PlanTableroFuente, string> = {
  plan_simple: "Plan simple",
  herramienta_5porques: "5 Porqués",
  herramienta_ishikawa: "Ishikawa",
  herramienta_pdca: "PDCA",
}

const FUENTE_CLASSES: Record<PlanTableroFuente, string> = {
  plan_simple: "bg-slate-100 text-slate-700",
  herramienta_5porques: "bg-blue-100 text-blue-700",
  herramienta_ishikawa: "bg-purple-100 text-purple-700",
  herramienta_pdca: "bg-rose-100 text-rose-700",
}

const ESTADOS: (PlanTableroEstado | "all")[] = [
  "all",
  "pendiente",
  "en_curso",
  "terminado",
]

const FUENTES: (PlanTableroFuente | "all")[] = [
  "all",
  "plan_simple",
  "herramienta_5porques",
  "herramienta_ishikawa",
  "herramienta_pdca",
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
  const [filtroFuente, setFiltroFuente] = useState<PlanTableroFuente | "all">("all")
  const [filtroResponsable, setFiltroResponsable] = useState<string>("all")

  const [detalleReporteId, setDetalleReporteId] = useState<string | null>(null)
  const [herramientaAbierta, setHerramientaAbierta] =
    useState<HerramientaGestionConContexto | null>(null)
  const [cargandoHerramienta, setCargandoHerramienta] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
      if (filtroFuente !== "all" && f.fuente !== filtroFuente) return false
      if (filtroResponsable !== "all" && f.responsable_id !== filtroResponsable) {
        return false
      }
      return true
    })
  }, [filas, filtroEstado, filtroFuente, filtroResponsable])

  // KPIs rápidos
  const kpis = useMemo(() => {
    const base = { total: 0, pendiente: 0, en_curso: 0, terminado: 0 }
    for (const f of filas ?? []) {
      base.total += 1
      base[f.estado] += 1
    }
    return base
  }, [filas])

  async function abrirHerramienta(id: string) {
    setCargandoHerramienta(id)
    try {
      const res = await getHerramientaGestion(id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setHerramientaAbierta(res.data)
    } finally {
      setCargandoHerramienta(null)
    }
  }

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
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3">
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
          <Label className="text-xs">Origen</Label>
          <Select
            value={filtroFuente}
            onValueChange={(v) =>
              setFiltroFuente((v ?? "all") as PlanTableroFuente | "all")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUENTES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f === "all" ? "Todos" : FUENTE_LABELS[f]}
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
                <TableHead className="w-32">Origen</TableHead>
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
                    colSpan={8}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                    Cargando planes…
                  </TableCell>
                </TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
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
                  const esHerramienta = f.fuente !== "plan_simple"
                  return (
                    <TableRow key={`${f.fuente}-${f.id}`} className="align-top">
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={FUENTE_CLASSES[f.fuente]}
                        >
                          {esHerramienta && (
                            <Wrench className="mr-1 inline size-3" />
                          )}
                          {FUENTE_LABELS[f.fuente]}
                        </Badge>
                      </TableCell>
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
                        {esHerramienta ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => abrirHerramienta(f.id)}
                            disabled={cargandoHerramienta === f.id}
                          >
                            {cargandoHerramienta === f.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "Ver"
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setDetalleReporteId(f.reporte_id)}
                          >
                            Ver
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog detalle reporte (plan simple → mismo dialog que la lista de reportes) */}
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

      {/* Dialog herramienta (5 porqués / ishikawa / pdca) */}
      <Dialog
        open={herramientaAbierta !== null}
        onOpenChange={(o) => !o && setHerramientaAbierta(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {herramientaAbierta
                ? HERRAMIENTA_GESTION_LABELS[herramientaAbierta.tipo]
                : "Herramienta de gestión"}
            </DialogTitle>
          </DialogHeader>
          {herramientaAbierta && (
            <HerramientaGestionView herramienta={herramientaAbierta} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { useMemo, useState } from "react"
import { Plus, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { NuevoReporteDialog } from "@/components/reportes-seguridad/nuevo-reporte-dialog"
import { ReporteDetalleDialog } from "@/components/reportes-seguridad/reporte-detalle-dialog"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_TIPO_COLORS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  type ReporteSeguridadConAutor,
  type ReporteSeguridadTipo,
  type ReporteSeguridadLocalidad,
  type UserRole,
} from "@/types/database"

const TIPOS: ReporteSeguridadTipo[] = [
  "accidente",
  "incidente",
  "acto_inseguro",
  "ruta_riesgo",
  "acto_seguro",
]

const LOCALIDADES: ReporteSeguridadLocalidad[] = [
  "san_nicolas",
  "ramallo",
  "pergamino",
  "colon",
  "otro",
]

function formatDate(iso: string): string {
  // fecha es DATE (YYYY-MM-DD); evitamos corrimiento por timezone.
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function isDentroDelMes(fechaISO: string): boolean {
  const [y, m] = fechaISO.split("-")
  if (!y || !m) return false
  const hoy = new Date()
  return (
    Number(y) === hoy.getFullYear() && Number(m) === hoy.getMonth() + 1
  )
}

export function ReportesSeguridadClient({
  reportes,
  currentProfileId,
  currentRole,
}: {
  reportes: ReporteSeguridadConAutor[]
  currentProfileId: string
  currentRole: UserRole
}) {
  const [openNuevo, setOpenNuevo] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<ReporteSeguridadTipo | "all">("all")
  const [filtroLocalidad, setFiltroLocalidad] = useState<
    ReporteSeguridadLocalidad | "all"
  >("all")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")

  // KPIs por tipo del mes actual
  const kpisMes = useMemo(() => {
    const base: Record<ReporteSeguridadTipo, number> = {
      accidente: 0,
      incidente: 0,
      acto_inseguro: 0,
      ruta_riesgo: 0,
      acto_seguro: 0,
    }
    for (const r of reportes) {
      if (isDentroDelMes(r.fecha)) base[r.tipo] += 1
    }
    return base
  }, [reportes])

  const filtrados = useMemo(() => {
    return reportes.filter((r) => {
      if (filtroTipo !== "all" && r.tipo !== filtroTipo) return false
      if (filtroLocalidad !== "all" && r.localidad !== filtroLocalidad) return false
      if (fechaDesde && r.fecha < fechaDesde) return false
      if (fechaHasta && r.fecha > fechaHasta) return false
      return true
    })
  }, [reportes, filtroTipo, filtroLocalidad, fechaDesde, fechaHasta])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="size-6 text-red-500" />
            Reportes de Seguridad
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accidentes, incidentes, actos/condiciones inseguras, rutas de riesgo y
            reconocimientos.
          </p>
        </div>
        <Button onClick={() => setOpenNuevo(true)}>
          <Plus className="mr-2 size-4" />
          Nuevo reporte
        </Button>
      </div>

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TIPOS.map((t) => (
          <div
            key={t}
            className="rounded-lg border bg-card p-3"
            style={{ borderLeft: `4px solid ${REPORTE_SEGURIDAD_TIPO_COLORS[t]}` }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {REPORTE_SEGURIDAD_TIPO_LABELS[t]}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{kpisMes[t]}</p>
            <p className="text-[11px] text-muted-foreground">este mes</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select
            value={filtroTipo}
            onValueChange={(v) =>
              setFiltroTipo((v ?? "all") as ReporteSeguridadTipo | "all")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {REPORTE_SEGURIDAD_TIPO_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Localidad</Label>
          <Select
            value={filtroLocalidad}
            onValueChange={(v) =>
              setFiltroLocalidad((v ?? "all") as ReporteSeguridadLocalidad | "all")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {LOCALIDADES.map((l) => (
                <SelectItem key={l} value={l}>
                  {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Desde</Label>
          <Input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Hasta</Label>
          <Input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Fecha</TableHead>
              <TableHead className="w-20">Hora</TableHead>
              <TableHead className="w-44">Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-36">Localidad</TableHead>
              <TableHead className="w-32">Área</TableHead>
              <TableHead className="w-40">Autor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                  No hay reportes para estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetalleId(r.id)}
                >
                  <TableCell className="text-sm">{formatDate(r.fecha)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.hora ? r.hora.slice(0, 5) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor:
                          REPORTE_SEGURIDAD_TIPO_COLORS[r.tipo] + "20",
                        color: REPORTE_SEGURIDAD_TIPO_COLORS[r.tipo],
                      }}
                    >
                      {REPORTE_SEGURIDAD_TIPO_LABELS[r.tipo]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm">
                    {r.descripcion}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.localidad ? REPORTE_SEGURIDAD_LOCALIDAD_LABELS[r.localidad] : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.area ? REPORTE_SEGURIDAD_AREA_LABELS[r.area] : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.autor_nombre}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <NuevoReporteDialog open={openNuevo} onOpenChange={setOpenNuevo} />
      {detalleId && (
        <ReporteDetalleDialog
          key={detalleId}
          reporteId={detalleId}
          open={true}
          onOpenChange={(v) => {
            if (!v) setDetalleId(null)
          }}
          currentProfileId={currentProfileId}
          currentRole={currentRole}
        />
      )}
    </div>
  )
}

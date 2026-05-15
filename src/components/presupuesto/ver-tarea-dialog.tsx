"use client"

import { Eye, FileDown } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  EstadoPresupuestoTarea,
  PresupuestoTareaConResponsable,
} from "@/types/database"

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function EstadoBadge({ estado }: { estado: EstadoPresupuestoTarea }) {
  if (estado === "completada") {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Completada
      </Badge>
    )
  }
  if (estado === "en_progreso") {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        En progreso
      </Badge>
    )
  }
  return (
    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
      Pendiente
    </Badge>
  )
}

function DesvioBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    return <span className="text-muted-foreground">—</span>
  }
  const abs = Math.abs(pct)
  const sign = pct > 0 ? "+" : ""
  if (abs < 5) {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        {sign}
        {pct.toFixed(1)}%
      </Badge>
    )
  }
  if (abs < 15) {
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        {sign}
        {pct.toFixed(1)}%
      </Badge>
    )
  }
  return (
    <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
      {sign}
      {pct.toFixed(1)}%
    </Badge>
  )
}

function Campo({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tarea: PresupuestoTareaConResponsable
  onAbrirArchivo: (url: string | null) => void
}

export function VerTareaDialog({
  open,
  onOpenChange,
  tarea,
  onAbrirArchivo,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 text-slate-600" />
            Detalle de la acción
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-slate-50 p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {MESES[tarea.mes - 1]} {tarea.anio}
          </p>
          <p className="mt-0.5 font-medium text-slate-900">{tarea.rubro}</p>
          {tarea.descripcion && (
            <p className="mt-1 text-xs text-slate-600">{tarea.descripcion}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Presupuestado">
            {formatMoney(tarea.monto_presupuestado)}
          </Campo>
          <Campo label="Real">{formatMoney(tarea.monto_real)}</Campo>
          <Campo label="Desvío">
            <DesvioBadge pct={tarea.desvio_pct} />
          </Campo>
          <Campo label="Estado">
            <EstadoBadge estado={tarea.estado} />
          </Campo>
          <Campo label="Responsable">
            {tarea.responsable_nombre ?? (
              <span className="italic text-muted-foreground">Sin asignar</span>
            )}
          </Campo>
          <Campo label="Vencimiento">{formatDate(tarea.fecha_limite)}</Campo>
        </div>

        <Campo label="Justificación">
          {tarea.justificacion ? (
            <p className="whitespace-pre-wrap rounded-md border bg-slate-50 p-2 text-sm">
              {tarea.justificacion}
            </p>
          ) : (
            <span className="italic text-muted-foreground">
              Sin justificación cargada
            </span>
          )}
        </Campo>

        <Campo label="Evidencia">
          {tarea.evidencia_url ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onAbrirArchivo(tarea.evidencia_url)}
            >
              <FileDown className="size-3.5" />
              {tarea.evidencia_nombre ?? "Descargar archivo"}
            </Button>
          ) : (
            <span className="italic text-muted-foreground">
              Sin evidencia adjunta
            </span>
          )}
        </Campo>

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <Campo label="Creada">{formatDateTime(tarea.created_at)}</Campo>
          <Campo label="Completada">
            {formatDateTime(tarea.completada_at)}
          </Campo>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

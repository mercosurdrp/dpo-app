"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getReportesSifPorDia } from "@/actions/reportes-seguridad"
import {
  REPORTE_SEGURIDAD_TIPO_LABELS,
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  REPORTE_SEGURIDAD_TIPO_SIF_LABELS,
  REPORTE_SEGURIDAD_TIPO_ACCIDENTE_LABELS,
  type ReporteSeguridadConAutor,
  type ReporteSeguridadTipoSif,
} from "@/types/database"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
  tipoSif: ReporteSeguridadTipoSif | null
}

function formatFechaLarga(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

export function SifDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
  tipoSif,
}: Props) {
  const [data, setData] = useState<ReporteSeguridadConAutor[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !fecha || !tipoSif) return
    setLoading(true)
    setError(null)
    const res = await getReportesSifPorDia(fecha, tipoSif)
    setLoading(false)
    if ("error" in res) {
      setError(res.error)
      setData(null)
      return
    }
    setData(res.data)
  }, [open, fecha, tipoSif])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {tipoSif ? REPORTE_SEGURIDAD_TIPO_SIF_LABELS[tipoSif] : "SIF"} del día
          </DialogTitle>
          <DialogDescription>{formatFechaLarga(fecha)}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && data && data.length === 0 && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
            Sin reportes de este tipo en el día.
          </p>
        )}

        {!loading && data && data.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Total:{" "}
              <strong className="text-foreground">{data.length}</strong>{" "}
              {data.length === 1 ? "reporte" : "reportes"}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Dónde</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm tabular-nums">
                      {r.hora ? r.hora.slice(0, 5) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {REPORTE_SEGURIDAD_TIPO_LABELS[r.tipo]}
                      </Badge>
                      {r.tipo_accidente && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          {REPORTE_SEGURIDAD_TIPO_ACCIDENTE_LABELS[
                            r.tipo_accidente
                          ]?.split(" — ")[0] ?? r.tipo_accidente.toUpperCase()}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {r.damnificado_nombre || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.area ? REPORTE_SEGURIDAD_AREA_LABELS[r.area] : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lugar ||
                        (r.localidad
                          ? REPORTE_SEGURIDAD_LOCALIDAD_LABELS[r.localidad]
                          : "—")}
                    </TableCell>
                    <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                      {r.descripcion || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

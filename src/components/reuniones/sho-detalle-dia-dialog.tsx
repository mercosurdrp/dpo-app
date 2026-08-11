"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, ExternalLink } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { getReportes } from "@/actions/reportes-seguridad"
import {
  REPORTE_SEGURIDAD_AREA_LABELS,
  REPORTE_SEGURIDAD_LOCALIDAD_LABELS,
  REPORTE_SEGURIDAD_TIPO_LABELS,
  type ReporteSeguridadConAutor,
} from "@/types/database"

/** Un día suelto (celda del tablero) o el acumulado del mes (columna MTD). */
export interface ShoDetalleRango {
  desde: string
  hasta: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  rango: ShoDetalleRango | null
}

function formatFechaLarga(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function formatFechaCorta(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
}

/** "14:30:00" → "14:30". Los reportes viejos pueden no tener hora. */
function formatHora(hora: string | null): string | null {
  if (!hora) return null
  return hora.slice(0, 5)
}

export function ShoDetalleDiaDialog({ open, onOpenChange, rango }: Props) {
  const [data, setData] = useState<ReporteSeguridadConAutor[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !rango) return
    setLoading(true)
    setError(null)
    const res = await getReportes({
      fecha_desde: rango.desde,
      fecha_hasta: rango.hasta,
    })
    setLoading(false)
    if ("error" in res) {
      setError(res.error)
      setData(null)
      return
    }
    // El tablero cuenta por CLASIFICACIÓN, no por tipo de reporte: un SHO puede
    // estar cargado como acto/condición insegura o como incidente. Mismo criterio
    // que la fila auto (`tipo_accidente === 'sho'`), si no el detalle mostraría
    // más reportes que los que suma la celda.
    setData(res.data.filter((r) => r.tipo_accidente === "sho"))
  }, [open, rango])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const esUnDia = rango != null && rango.desde === rango.hasta

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {esUnDia ? "SHO del día" : "SHO del mes"}
          </DialogTitle>
          <DialogDescription>
            {rango == null
              ? ""
              : esUnDia
                ? formatFechaLarga(rango.desde)
                : `Del ${formatFechaCorta(rango.desde)} al ${formatFechaCorta(rango.hasta)}`}{" "}
            · Condiciones y comportamientos inseguros reportados
          </DialogDescription>
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
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {esUnDia
              ? "No se reportó ningún SHO este día."
              : "No se reportó ningún SHO en el período."}
          </p>
        )}

        {!loading && data && data.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{data.length}</strong>{" "}
              {data.length === 1 ? "reporte" : "reportes"}
            </p>

            {data.map((r) => {
              const hora = formatHora(r.hora)
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="font-medium">
                      {REPORTE_SEGURIDAD_TIPO_LABELS[r.tipo]}
                    </Badge>
                    {!esUnDia && (
                      <span className="font-medium text-slate-700">
                        {formatFechaCorta(r.fecha)}
                      </span>
                    )}
                    {hora && <span className="text-muted-foreground">{hora}</span>}
                    {r.area && (
                      <span className="text-muted-foreground">
                        {REPORTE_SEGURIDAD_AREA_LABELS[r.area]}
                      </span>
                    )}
                    {r.localidad && (
                      <span className="text-muted-foreground">
                        {REPORTE_SEGURIDAD_LOCALIDAD_LABELS[r.localidad]}
                      </span>
                    )}
                    {r.lugar && (
                      <span className="text-muted-foreground">· {r.lugar}</span>
                    )}
                  </div>

                  {r.quien_que && (
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {r.quien_que}
                    </p>
                  )}

                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {r.descripcion}
                  </p>

                  {r.accion_tomada && (
                    <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-sm text-emerald-800">
                      <span className="font-medium">Acción tomada: </span>
                      {r.accion_tomada}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-muted-foreground">
                    Cargado por {r.autor_nombre}
                  </p>
                </div>
              )
            })}

            <Link
              href="/reportes-seguridad"
              className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
            >
              Ver todos los reportes de seguridad
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

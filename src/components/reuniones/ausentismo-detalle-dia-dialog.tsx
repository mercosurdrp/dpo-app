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
import { getAusentismoDelDiaEventos } from "@/actions/ausentismo"
import type { AusentismoPersona } from "@/actions/asistencia"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fecha: string | null
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

function TipoBadge({ tipo }: { tipo: AusentismoPersona["tipo"] }) {
  if (tipo === "licencia_medica") {
    return (
      <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
        Licencia médica
      </Badge>
    )
  }
  return (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Ausente</Badge>
  )
}

export function AusentismoDetalleDiaDialog({
  open,
  onOpenChange,
  fecha,
}: Props) {
  const [data, setData] = useState<AusentismoPersona[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !fecha) return
    setLoading(true)
    setError(null)
    const res = await getAusentismoDelDiaEventos(fecha)
    setLoading(false)
    if ("error" in res) {
      setError(res.error)
      setData(null)
      return
    }
    setData(res.data)
  }, [open, fecha])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const licencias =
    data?.filter((p) => p.tipo === "licencia_medica").length ?? 0
  const ausentes = data?.filter((p) => p.tipo === "ausente").length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ausentismo del día</DialogTitle>
          <DialogDescription>
            {formatFechaLarga(fecha)} · Depósito + Distribución
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
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Sin ausencias registradas este día.
          </p>
        )}

        {!loading && data && data.length > 0 && (
          <>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Total: <strong className="text-foreground">{data.length}</strong>
              </span>
              <span className="text-muted-foreground">
                Ausentes: <strong className="text-foreground">{ausentes}</strong>
              </span>
              <span className="text-muted-foreground">
                Lic. médica:{" "}
                <strong className="text-foreground">{licencias}</strong>
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legajo</TableHead>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Observaciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.legajo}>
                    <TableCell className="font-mono text-sm">
                      {p.legajo}
                    </TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {p.sector}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TipoBadge tipo={p.tipo} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.observaciones ?? "—"}
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

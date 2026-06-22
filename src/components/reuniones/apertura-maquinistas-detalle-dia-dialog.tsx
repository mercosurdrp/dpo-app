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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getAperturaMaquinistasDia } from "@/actions/reuniones"
import type { AperturaMaquinistasDelDia } from "@/lib/warehouse/auto-indicadores"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunionId: string
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

function formatNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 })
}

export function AperturaMaquinistasDetalleDiaDialog({
  open,
  onOpenChange,
  reunionId,
  fecha,
}: Props) {
  const [data, setData] = useState<AperturaMaquinistasDelDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !fecha || !reunionId) return
    setLoading(true)
    setError(null)
    const res = await getAperturaMaquinistasDia(reunionId, fecha)
    if ("error" in res) {
      setError(res.error)
      setData(null)
    } else {
      setData(res.data)
    }
    setLoading(false)
  }, [open, fecha, reunionId])

  useEffect(() => {
    if (!open) {
      setData(null)
      setError(null)
      return
    }
    void cargar()
  }, [open, cargar])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Maquinistas — despacho del día</DialogTitle>
          <DialogDescription className="capitalize">
            {fecha ? formatFechaLarga(fecha) : "Sin fecha"}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando productividad de maquinistas…
          </div>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && data && data.filas.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin registros de despacho para este día.
          </p>
        )}

        {!loading && data && data.filas.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Maquinista</TableHead>
                <TableHead className="text-right">Pal/HH</TableHead>
                <TableHead className="text-right">Bul/HH</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.filas.map((fila) => (
                <TableRow key={fila.operario}>
                  <TableCell className="font-medium capitalize">
                    {fila.operario.toLowerCase()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(fila.pal_hh)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(fila.bul_hh)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2">
                <TableCell className="font-semibold">Promedio</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatNum(data.pal_hh_promedio)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}

        {!loading && data && (
          <p className="text-[11px] text-muted-foreground">
            Solo carga de camiones (despacho). Pallets/hora por maquinista —
            fuente: tablero del WMS (deposito-esteban).
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

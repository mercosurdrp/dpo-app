"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDqiPorPatenteRanking, type DqiRankingData } from "@/actions/dqi"

const MESES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const fmtHL = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtPPM = (n: number) => new Intl.NumberFormat("es-AR").format(n)

/** Detalle por camión del DQI del mes (roturas en ruta). Se abre desde el MTD de
 * la fila "DQI · roturas en ruta" del tablero de la matinal. */
export function DqiPatentesDialog({
  open,
  onOpenChange,
  anio,
  mes,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  anio: number
  mes: number
}) {
  const [data, setData] = useState<DqiRankingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    startTransition(async () => {
      const res = await getDqiPorPatenteRanking(anio, mes)
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setError(null)
        setData(res.data)
      }
    })
  }, [open, anio, mes])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[720px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>DQI por camión · {MESES_FULL[mes - 1]} {anio}</DialogTitle>
          <DialogDescription>
            Roturas ocurridas en ruta, en PPM sobre el HL que despachó cada camión.
            {data?.dqi_ppm != null && ` DQI del mes: ${fmtPPM(data.dqi_ppm)} PPM.`}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        )}

        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {!loading && !error && data && data.patentes.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Camión</TableHead>
                  <TableHead className="text-right">HL despachados</TableHead>
                  <TableHead className="text-right">HL rotos</TableHead>
                  <TableHead className="text-right">DQI (PPM)</TableHead>
                  <TableHead className="text-right">% de las roturas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.patentes.map((p) => (
                  <TableRow key={p.patente}>
                    <TableCell className="font-mono">
                      {p.patente}
                      {p.movil && (
                        <span className="ml-2 text-xs text-slate-400">móvil {p.movil}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-600">
                      {p.hl_despachados != null ? fmtHL(p.hl_despachados) : "s/d"}
                      {p.base_chica && (
                        <span
                          className="ml-1 cursor-help text-amber-500"
                          title="Despachó muy poco en el período: con tan poco volumen una sola rotura dispara el PPM."
                        >
                          *
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtHL(p.roturas.hl)}</TableCell>
                    <TableCell
                      className={`text-right font-mono font-semibold ${
                        p.ppm == null
                          ? "text-slate-400"
                          : p.ppm === 0
                            ? "text-emerald-700"
                            : data.dqi_ppm != null && p.ppm > data.dqi_ppm
                              ? "text-red-600"
                              : "text-slate-700"
                      }`}
                    >
                      {p.ppm != null ? fmtPPM(p.ppm) : "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-slate-500">
                      {p.pct_roturas.toLocaleString("es-AR")}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[11px] text-slate-400">
              El DQI general no se recalcula: el denominador de cada camión es su parte del HL
              entregado del mes, prorrateada por lo que despachó. Sólo entran las roturas (los
              faltantes se ven en <code>/indicadores/dqi</code>).
              {data.patentes.some((p) => p.base_chica) && (
                <>
                  {" "}
                  <span className="text-amber-600">
                    (*) despachó muy poco en el mes: su PPM se dispara con una sola rotura.
                  </span>
                </>
              )}
            </p>
          </>
        )}

        {!loading && !error && data && data.patentes.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Sin roturas de distribución registradas en {MESES_FULL[mes - 1]} {anio}.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

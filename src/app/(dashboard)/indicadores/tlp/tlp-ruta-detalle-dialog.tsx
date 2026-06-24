"use client"

import { useEffect, useState } from "react"
import { Loader2, ArrowRight } from "lucide-react"
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
import { getTlpRutaDetalle, type TlpRutaViaje } from "@/actions/tlp"

const fmtN = (n: number, dec = 0) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)

function fmtHora(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    })
  } catch {
    return "—"
  }
}
function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-")
  return `${d}/${m}`
}
function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}

export interface RutaFiltro {
  tipo: "all" | "ciudad" | "patente"
  valor?: string
  label: string
}

export function TlpRutaDetalleDialog({
  open,
  onClose,
  desde,
  hasta,
  filtro,
}: {
  open: boolean
  onClose: () => void
  desde: string
  hasta: string
  filtro: RutaFiltro | null
}) {
  const [data, setData] = useState<TlpRutaViaje[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setData(null)
      setError(null)
      return
    }
    let cancel = false
    setLoading(true)
    setError(null)
    void getTlpRutaDetalle(desde, hasta).then((res) => {
      if (cancel) return
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setData(res.data)
      }
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [open, desde, hasta])

  const filtrados = (data ?? []).filter((v) => {
    if (!filtro || filtro.tipo === "all") return true
    if (filtro.tipo === "ciudad") return v.ciudad === filtro.valor
    return v.patente === filtro.valor
  })
  const cuentan = filtrados.filter((v) => !v.excluido)
  const totHoras = cuentan.reduce((a, v) => a + v.horas_ruta, 0)
  const totHH = cuentan.reduce((a, v) => a + v.horas_hombre, 0)
  const totCeq = cuentan.reduce((a, v) => a + v.ceq, 0)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-[1000px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Horas en ruta — detalle
            {filtro && filtro.tipo !== "all" && (
              <span className="ml-2 text-base font-normal text-muted-foreground">· {filtro.label}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            Cómo se calculan las horas en ruta del mes, viaje por viaje.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <p>
            Por viaje: <strong>horas en ruta = retorno − salida</strong> (del checklist del
            vehículo). <strong>Horas-hombre = horas en ruta × FTE</strong> (chofer + ayudantes),
            y es el denominador del TLP.
          </p>
          <p className="text-xs">
            Los viajes con CEq pero sin checklist de retorno no tienen tiempo y se excluyen del
            cálculo (se listan al final, en gris).
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Cargando viajes…
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        {!loading && !error && data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Chip label="Viajes que cuentan" value={fmtN(cuentan.length)} />
              <Chip label="Horas en ruta" value={fmtN(totHoras, 1)} />
              <Chip label="Horas-hombre" value={fmtN(totHH, 1)} />
              <Chip label="CEq" value={fmtN(totCeq)} />
              <Chip
                label="TLP"
                value={totHH > 0 ? fmtN(totCeq / totHH, 2) : "—"}
                strong
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead className="text-center">Salida → Retorno</TableHead>
                    <TableHead className="text-right">Tiempo</TableHead>
                    <TableHead className="text-right">Hs ruta</TableHead>
                    <TableHead className="text-right">FTE</TableHead>
                    <TableHead className="text-right">Hs-hombre</TableHead>
                    <TableHead className="text-right">CEq</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                        Sin viajes para este filtro.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtrados.map((v) => (
                      <TableRow key={`${v.patente}|${v.fecha}`} className={v.excluido ? "opacity-50" : ""}>
                        <TableCell className="tabular-nums">{fmtFecha(v.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">{v.patente}</TableCell>
                        <TableCell className="text-sm">{v.ciudad}</TableCell>
                        <TableCell>
                          <span className="flex items-center justify-center gap-1.5 tabular-nums text-sm">
                            {fmtHora(v.salida)}
                            <ArrowRight className="size-3 text-slate-400" />
                            {fmtHora(v.retorno)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.excluido ? (
                            <span className="text-red-600">sin retorno</span>
                          ) : (
                            fmtMin(v.minutos)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {v.excluido ? "—" : fmtN(v.horas_ruta, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.fte}
                          {v.fte_fallback && <span className="ml-0.5 text-[10px] text-amber-600" title="FTE estimado (2) por falta de registro de egreso">*</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {v.excluido ? "—" : fmtN(v.horas_hombre, 2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-slate-500">{fmtN(v.ceq)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              <span className="text-amber-600">*</span> FTE estimado en 2 por falta de registro de
              egreso del día.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Chip({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className={strong ? "text-emerald-700" : "text-slate-900"}>{value}</strong>
    </span>
  )
}

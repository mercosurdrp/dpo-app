"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAperturaPickingDia,
  setAperturaPickingHlHh,
} from "@/actions/reuniones"
import type {
  AperturaPickingDelDia,
  OperadorApertura,
} from "@/lib/warehouse/auto-indicadores"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  reunionId: string
  fecha: string | null
  puedeEditar: boolean
  /** Callback al guardar exitosamente un bul/HH manual, para refrescar la grilla padre. */
  onChange?: () => void
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

function formatNum(n: number | null, digits = 0): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatPctFrac(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return `${(n * 100).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

export function AperturaPickingDetalleDiaDialog({
  open,
  onOpenChange,
  reunionId,
  fecha,
  puedeEditar,
  onChange,
}: Props) {
  const [data, setData] = useState<AperturaPickingDelDia | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<OperadorApertura, string>>({
    Troli: "",
    Galvez: "",
    Ovejero: "",
  })
  const [saving, startSaving] = useTransition()
  const [savingFor, setSavingFor] = useState<OperadorApertura | null>(null)

  const cargar = useCallback(async () => {
    if (!open || !fecha || !reunionId) return
    setLoading(true)
    setError(null)
    const res = await getAperturaPickingDia(reunionId, fecha)
    if ("error" in res) {
      setError(res.error)
      setData(null)
    } else {
      setData(res.data)
      const next: Record<OperadorApertura, string> = {
        Troli: "",
        Galvez: "",
        Ovejero: "",
      }
      for (const fila of res.data.filas) {
        if (fila.bul_hh_manual !== null && fila.bul_hh_manual !== undefined) {
          next[fila.operador] = String(fila.bul_hh_manual)
        }
      }
      setEditing(next)
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

  function handleBlur(operador: OperadorApertura) {
    if (!reunionId) return
    const raw = editing[operador].trim()
    const valor = raw === "" ? null : Number(raw.replace(",", "."))
    if (raw !== "" && !Number.isFinite(valor as number)) {
      setError(`Valor inválido para ${operador}`)
      return
    }
    setSavingFor(operador)
    startSaving(async () => {
      const res = await setAperturaPickingHlHh(reunionId, operador, valor)
      if ("error" in res) {
        setError(res.error)
      } else {
        setError(null)
        await cargar()
        onChange?.()
      }
      setSavingFor(null)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apertura por operador</DialogTitle>
          <DialogDescription className="capitalize">
            {fecha ? formatFechaLarga(fecha) : "Sin fecha"}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando datos del WMS y Sheet…
          </div>
        )}

        {error && !loading && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operador</TableHead>
                <TableHead className="text-right">Bultos</TableHead>
                <TableHead className="text-right">Errores</TableHead>
                <TableHead className="text-right">Bultos errados</TableHead>
                <TableHead className="text-right">Precisión</TableHead>
                <TableHead className="text-right">bul/HH</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.filas.map((fila) => (
                <TableRow key={fila.operador}>
                  <TableCell className="font-medium">{fila.operador}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(fila.bultos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(fila.errores_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNum(fila.errores)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPctFrac(fila.precision)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {puedeEditar ? (
                      <div className="flex items-center justify-end gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          className="h-8 w-24 text-right tabular-nums"
                          placeholder={
                            fila.bul_hh_auto !== null
                              ? formatNum(fila.bul_hh_auto, 1)
                              : "—"
                          }
                          value={editing[fila.operador]}
                          onChange={(e) =>
                            setEditing((prev) => ({
                              ...prev,
                              [fila.operador]: e.target.value,
                            }))
                          }
                          onBlur={() => handleBlur(fila.operador)}
                          disabled={saving && savingFor === fila.operador}
                        />
                        {saving && savingFor === fila.operador && (
                          <Loader2 className="size-3 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <span>{formatNum(fila.bul_hh_efectivo, 1)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {!loading && data && puedeEditar && (
          <p className="text-[11px] text-muted-foreground">
            El placeholder muestra el valor automático del WMS. Cargá un valor
            manual si querés sobreescribirlo; dejá vacío para volver al auto.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

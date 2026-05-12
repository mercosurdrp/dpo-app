"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getAperturaPicking,
  setAperturaPickingHlHh,
  type AperturaPickingResponse,
} from "@/actions/reuniones"
import type { OperadorApertura } from "@/lib/warehouse/auto-indicadores"

interface Props {
  reunionId: string
  /** Si el usuario puede editar (mismo criterio que setIndicadorValor). */
  puedeEditar: boolean
  /** Callback cuando el usuario actualiza un bul/HH, para que el padre refresque la grilla. */
  onChange?: () => void
}

function formatFechaCorta(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
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

export function AperturaPickingSubcuadro({ reunionId, puedeEditar, onChange }: Props) {
  const [data, setData] = useState<AperturaPickingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<OperadorApertura, string>>({
    Troli: "",
    Galvez: "",
    Ovejero: "",
  })
  const [saving, startSaving] = useTransition()
  const [savingFor, setSavingFor] = useState<OperadorApertura | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await getAperturaPicking(reunionId)
    if ("error" in res) {
      setError(res.error)
      setData(null)
    } else {
      setData(res.data)
      // Cargar inputs con el valor manual si hay; sino vacío (placeholder=auto)
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
  }, [reunionId])

  useEffect(() => {
    void cargar()
  }, [cargar, refreshKey])

  function handleBlur(operador: OperadorApertura) {
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
        setRefreshKey((k) => k + 1)
        onChange?.()
      }
      setSavingFor(null)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Apertura por operador
          {data && (
            <span className="ml-2 text-xs font-normal capitalize text-muted-foreground">
              — día anterior hábil ({formatFechaCorta(data.diaAnterior)})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Cargando datos del WMS y Sheet…
          </div>
        )}

        {error && !loading && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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
          <p className="mt-3 text-[11px] text-muted-foreground">
            El placeholder muestra el valor automático del WMS. Cargá un valor
            manual si querés sobreescribirlo; dejá vacío para volver al auto.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

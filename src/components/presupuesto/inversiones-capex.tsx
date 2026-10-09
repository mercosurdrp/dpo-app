"use client"

import { useMemo, useState, useTransition } from "react"
import { Loader2, Pencil, PiggyBank } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { guardarPresupuestoCapex } from "@/actions/presupuesto-inversiones"
import type { InversionConDetalle, PresupuestoCapex } from "@/types/database"
import { isoHoy, resumenCapex } from "@/lib/inversiones-seguimiento"

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

interface Props {
  anio: number
  inversiones: InversionConDetalle[]
  capex: PresupuestoCapex | null
  puedeEditar: boolean
  onSaved: () => void
}

function formatMoney(n: number | null): string {
  if (n === null || n === undefined) return "—"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—"
  return `${p.toFixed(0)} %`
}

function fmtSigned(n: number): string {
  if (n === 0) return formatMoney(0)
  return `${n > 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`
}

export function InversionesCapex({
  anio,
  inversiones,
  capex,
  puedeEditar,
  onSaved,
}: Props) {
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const hoy = isoHoy()
  const mesActual = Number(hoy.slice(5, 7))
  const esAnioActual = Number(hoy.slice(0, 4)) === anio

  const r = useMemo(
    () => resumenCapex(inversiones, anio, capex?.monto ?? null, hoy),
    [inversiones, anio, capex, hoy],
  )

  const presupuesto = r.presupuesto
  const planificado = r.presupuestoPlanificado
  const base = presupuesto > 0 ? presupuesto : null
  const pctEjecutado = base ? (r.ejecutado / base) * 100 : null
  const pctPendiente = base ? (r.pendiente / base) * 100 : null
  const excedido = base !== null && r.comprometido > base

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await guardarPresupuestoCapex(anio, fd)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setEditando(false)
      onSaved()
    })
  }

  return (
    <div className="space-y-4">
      {/* Presupuesto CAPEX del año */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                <PiggyBank className="size-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Presupuesto CAPEX {anio}
                </p>
                <p className="text-lg font-bold text-slate-900">
                  {formatMoney(presupuesto)}
                </p>
                {planificado && !editando && (
                  <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                    Es lo planificado: la suma de lo estimado de las {r.nTotal}{" "}
                    inversiones del año. Si gerencia aprueba un monto distinto,
                    cargalo acá.
                  </p>
                )}
                {!planificado && capex?.observaciones && !editando && (
                  <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">
                    {capex.observaciones}
                  </p>
                )}
              </div>
            </div>
            {puedeEditar && !editando && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditando(true)}
              >
                <Pencil className="mr-2 size-3.5" />
                {planificado ? "Fijar monto aprobado" : "Editar"}
              </Button>
            )}
          </div>

          {editando && (
            <form
              onSubmit={handleSubmit}
              className="mt-3 grid gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3 sm:grid-cols-[200px_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor="capex_monto">Monto ($)</Label>
                <Input
                  id="capex_monto"
                  name="monto"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  defaultValue={capex?.monto ?? ""}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="capex_obs">De dónde sale / aprobación</Label>
                <Textarea
                  id="capex_obs"
                  name="observaciones"
                  rows={1}
                  defaultValue={capex?.observaciones ?? ""}
                  placeholder="Ej. CAPEX aprobado por gerencia en el presupuesto 2026"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setEditando(false)
                    setError(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                  Guardar
                </Button>
              </div>
              {error && (
                <p className="sm:col-span-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
            </form>
          )}

          {/* Barra: ejecutado + pendiente sobre el presupuesto */}
          <div className="mt-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
              {base !== null && (
                <>
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, pctEjecutado ?? 0)}%` }}
                    title={`Ejecutado ${formatMoney(r.ejecutado)}`}
                  />
                  <div
                    className="h-full bg-amber-400"
                    style={{
                      width: `${Math.max(0, Math.min(100 - Math.min(100, pctEjecutado ?? 0), pctPendiente ?? 0))}%`,
                    }}
                    title={`Pendiente ${formatMoney(r.pendiente)}`}
                  />
                </>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <p>
                <span className="mr-1 inline-block size-2 rounded-sm bg-emerald-500" />
                Ejecutado{" "}
                <strong className="text-slate-900">{formatMoney(r.ejecutado)}</strong>
                {pctEjecutado !== null && (
                  <span className="text-muted-foreground"> · {fmtPct(pctEjecutado)}</span>
                )}
              </p>
              <p>
                <span className="mr-1 inline-block size-2 rounded-sm bg-amber-400" />
                Pendiente{" "}
                <strong className="text-slate-900">{formatMoney(r.pendiente)}</strong>
                {pctPendiente !== null && (
                  <span className="text-muted-foreground"> · {fmtPct(pctPendiente)}</span>
                )}
              </p>
              <p>
                Comprometido{" "}
                <strong className="text-slate-900">{formatMoney(r.comprometido)}</strong>
                <span className="text-muted-foreground"> · {r.nTotal} inv.</span>
              </p>
              {planificado ? (
                <p className="text-muted-foreground">
                  Presupuesto = lo planificado
                </p>
              ) : (
                <p>
                  {excedido ? "Excede el presupuesto" : "Disponible"}{" "}
                  <strong className={excedido ? "text-red-700" : "text-slate-900"}>
                    {r.disponible === null ? "—" : formatMoney(Math.abs(r.disponible))}
                  </strong>
                </p>
              )}
            </div>
          </div>

          {/* Cumplimiento (R5.3.4: a tiempo y dentro del presupuesto) */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Realizadas</p>
              <p className="text-base font-bold text-slate-900">
                {r.nRealizadas}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  / {r.nTotal}
                </span>
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">En plazo</p>
              <p className="text-base font-bold text-emerald-700">
                {r.nEnPlazo}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  · {r.nTarde} tarde
                </span>
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">En presupuesto</p>
              <p className="text-base font-bold text-emerald-700">
                {r.nEnPresupuesto}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  · {r.nSobrePresupuesto} se pasaron
                </span>
              </p>
            </div>
            <div className="rounded-lg border bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">Real vs estimado (realizadas)</p>
              <p className="text-base font-bold text-slate-900">
                {(() => {
                  const est = inversiones
                    .filter((i) => i.estado === "realizada")
                    .reduce((a, i) => a + (i.monto_estimado ?? 0), 0)
                  if (est === 0) return "—"
                  const d = ((r.ejecutado - est) / est) * 100
                  return `${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} %`
                })()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seguimiento mensual */}
      <div className="rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-700">
            Seguimiento mensual {anio}
          </p>
          <p className="text-xs text-muted-foreground">
            Sólo inversiones del año (las de 2 a 5 años van en Tabla y Gantt) ·
            Plan = estimado de lo programado para el mes · Real = lo realizado
            en el mes · acumulados y diferencia
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes</TableHead>
              <TableHead className="text-right">Plan</TableHead>
              <TableHead className="text-right">Real</TableHead>
              <TableHead className="text-right">Plan acum.</TableHead>
              <TableHead className="text-right">Real acum.</TableHead>
              <TableHead className="text-right">Real − plan acum.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.meses.map((m) => {
              const esActual = esAnioActual && m.mes === mesActual
              const pasado = !esAnioActual
                ? Number(hoy.slice(0, 4)) > anio
                : m.mes < mesActual
              const vacio = m.plan === 0 && m.real === 0
              const dif = m.realAcum - m.planAcum
              return (
                <TableRow
                  key={m.mes}
                  className={`${esActual ? "bg-blue-50/60" : ""} ${vacio && !esActual ? "text-muted-foreground" : ""}`}
                >
                  <TableCell className="text-sm font-medium">
                    {MESES[m.mes - 1]}
                    {esActual && (
                      <span className="ml-2 text-[10px] font-normal text-blue-700">
                        en curso
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {m.plan ? formatMoney(m.plan) : "—"}
                    {m.nPlan > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({m.nPlan})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {m.real ? formatMoney(m.real) : "—"}
                    {m.nReal > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({m.nReal})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {formatMoney(m.planAcum)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-sm">
                    {pasado || esActual ? formatMoney(m.realAcum) : "—"}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap text-right text-sm ${
                      pasado || esActual
                        ? dif > 0
                          ? "text-red-700"
                          : dif < 0
                            ? "text-emerald-700"
                            : ""
                        : ""
                    }`}
                    title="Positivo: se ejecutó más de lo planificado hasta ese mes. Negativo: se ejecutó menos (o más tarde)."
                  >
                    {pasado || esActual ? fmtSigned(dif) : "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

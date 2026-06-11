"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  CalendarClock,
  Loader2,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { getCumplimientoMes, getDetalleDiaSla } from "@/actions/sla"
import {
  type CumplimientoMes,
  type EstadoCumplimiento,
  type DetalleDiaSla,
} from "@/lib/sla-cumplimiento"

// Iniciales del día de la semana (0=Dom..6=Sáb), estilo ES (L M X J V S D).
const INICIAL_DOW = ["D", "L", "M", "X", "J", "V", "S"]

function dowDe(year: number, month: number, dia: number): number {
  return new Date(Date.UTC(year, month - 1, dia)).getUTCDay()
}

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export function SlaCumplimientos({ inicial }: { inicial: CumplimientoMes }) {
  const [data, setData] = useState<CumplimientoMes>(inicial)
  const [pending, start] = useTransition()

  // Detalle (modal al hacer clic en una celda).
  const [open, setOpen] = useState(false)
  const [detalle, setDetalle] = useState<DetalleDiaSla | null>(null)
  const [pendingDet, startDet] = useTransition()

  const monthValue = `${data.year}-${String(data.month).padStart(2, "0")}`
  const diasArr = Array.from({ length: data.diasDelMes }, (_, i) => i + 1)

  function cambiarMes(value: string) {
    const [y, m] = value.split("-").map(Number)
    if (!y || !m) return
    start(async () => {
      const r = await getCumplimientoMes(y, m)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setData(r.data)
    })
  }

  function abrirDetalle(codigo: string, dia: number) {
    const iso = `${data.year}-${String(data.month).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    setDetalle(null)
    setOpen(true)
    startDet(async () => {
      const r = await getDetalleDiaSla(codigo, iso)
      if ("error" in r) {
        toast.error(r.error)
        setOpen(false)
        return
      }
      setDetalle(r.data)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <CalendarClock className="size-5 text-pink-600" />
            Cumplimiento diario de SLA
          </h2>
          <p className="text-sm text-slate-500">
            Una fila por SLA. La primera columna es el % de cumplimiento del mes;
            cada día indica si se cumplió. Tocá un día <b>Sí</b>/<b>No</b> para ver
            el detalle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Mes</label>
          <Input
            type="month"
            value={monthValue}
            disabled={pending}
            onChange={(e) => cambiarMes(e.target.value)}
            className="w-[10rem]"
          />
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <Leyenda estado="si" texto="Cumple" />
        <Leyenda estado="no" texto="No cumple" />
        <Leyenda estado="sd" texto="Sin dato" />
        <Leyenda estado="na" texto="No aplica" />
        <span>· Objetivo ≥ 95%</span>
      </div>

      {/* Matriz SLA × días */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 min-w-[14rem] border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">
                SLA
              </th>
              <th className="min-w-[5rem] border-r border-slate-200 px-2 py-2 text-center font-semibold text-slate-700">
                % mes
              </th>
              {diasArr.map((d) => {
                const dow = dowDe(data.year, data.month, d)
                const finde = dow === 0 || dow === 6
                return (
                  <th
                    key={d}
                    className={`w-9 px-0 py-1 text-center font-medium ${
                      finde ? "bg-slate-100 text-slate-400" : "text-slate-500"
                    }`}
                  >
                    <div className="text-xs leading-tight">{d}</div>
                    <div className="text-[10px] leading-tight text-slate-400">
                      {INICIAL_DOW[dow]}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data.filas.map((fila) => {
              const cumpleTarget =
                fila.porcentaje !== null && fila.porcentaje >= fila.target
              return (
                <tr key={fila.codigo} className="border-t border-slate-200">
                  <td className="sticky left-0 z-10 min-w-[14rem] border-r border-slate-200 bg-white px-3 py-2 font-medium text-slate-800">
                    {fila.nombre}
                  </td>
                  <td className="border-r border-slate-200 px-2 py-2 text-center">
                    {fila.mtdLabel != null ? (
                      <span
                        className="inline-block rounded bg-slate-100 px-2 py-0.5 text-sm font-bold tabular-nums text-slate-700"
                        title="Acumulado del mes (informativo)"
                      >
                        {fila.mtdLabel}
                      </span>
                    ) : (
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-sm font-bold tabular-nums ${
                          fila.porcentaje === null
                            ? "text-slate-400"
                            : cumpleTarget
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {fila.porcentaje === null ? "—" : `${fila.porcentaje}%`}
                      </span>
                    )}
                  </td>
                  {fila.dias.map((estado, i) => (
                    <td key={i} className="px-0 py-1 text-center">
                      <CeldaDia
                        estado={estado}
                        onClick={
                          estado === "si" || estado === "no"
                            ? () => abrirDetalle(fila.codigo, i + 1)
                            : undefined
                        }
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de detalle del día */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{detalle?.nombre ?? "Detalle del día"}</DialogTitle>
            <DialogDescription>
              {detalle
                ? `${detalle.diaSemana} ${fechaLarga(detalle.fecha)}`
                : "Cargando…"}
            </DialogDescription>
          </DialogHeader>

          {pendingDet || !detalle ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <SlaDetalleDiaBody d={detalle} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Exportado: también lo usa la Etapa 4 — Cumplimiento de SLA de las reuniones.
export function SlaDetalleDiaBody({ d }: { d: DetalleDiaSla }) {
  const cumple = d.estado === "si"
  const noCumple = d.estado === "no"
  return (
    <div className="space-y-4">
      {/* Estado + valor vs meta */}
      <div
        className={`flex items-center gap-3 rounded-lg border p-3 ${
          cumple
            ? "border-emerald-200 bg-emerald-50"
            : noCumple
              ? "border-red-200 bg-red-50"
              : "border-slate-200 bg-slate-50"
        }`}
      >
        {cumple ? (
          <CheckCircle2 className="size-7 shrink-0 text-emerald-600" />
        ) : noCumple ? (
          <XCircle className="size-7 shrink-0 text-red-600" />
        ) : null}
        <div className="min-w-0">
          <div
            className={`text-lg font-bold leading-tight ${
              cumple
                ? "text-emerald-700"
                : noCumple
                  ? "text-red-700"
                  : "text-slate-600"
            }`}
          >
            {cumple ? "Cumple" : noCumple ? "No cumple" : "Sin dato"}
          </div>
          <div className="text-sm text-slate-600">
            Medido: <b className="tabular-nums">{d.valorLabel}</b> · {d.metaLabel}
          </div>
        </div>
      </div>

      {d.nota && <p className="text-sm text-slate-500">{d.nota}</p>}

      {/* Justificativo/comentario cargado en /ruteo */}
      {d.comentario && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Justificativo
            </p>
            <p className="text-sm italic text-slate-700">{d.comentario}</p>
          </div>
        </div>
      )}

      {/* Desglose */}
      {d.filas.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <tbody>
              {d.filas.map((f, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 text-slate-600">{f.label}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-900">
                    {f.valor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const ESTILO: Record<
  EstadoCumplimiento,
  { texto: string; className: string; titulo: string }
> = {
  si: { texto: "Sí", className: "bg-emerald-100 text-emerald-700", titulo: "Cumple" },
  no: { texto: "No", className: "bg-red-100 text-red-700", titulo: "No cumple" },
  sd: { texto: "–", className: "text-slate-300", titulo: "Sin dato" },
  na: { texto: "·", className: "text-slate-300", titulo: "No aplica" },
}

function CeldaDia({
  estado,
  onClick,
}: {
  estado: EstadoCumplimiento
  onClick?: () => void
}) {
  const e = ESTILO[estado]
  const base = `inline-flex h-6 w-7 items-center justify-center rounded text-xs font-semibold ${e.className}`
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${e.titulo} — ver detalle`}
        className={`${base} cursor-pointer transition hover:ring-2 hover:ring-pink-400 hover:ring-offset-1`}
      >
        {e.texto}
      </button>
    )
  }
  return (
    <span className={base} title={e.titulo}>
      {e.texto}
    </span>
  )
}

function Leyenda({
  estado,
  texto,
}: {
  estado: EstadoCumplimiento
  texto: string
}) {
  const e = ESTILO[estado]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex h-5 w-6 items-center justify-center rounded text-xs font-semibold ${e.className}`}
      >
        {e.texto}
      </span>
      {texto}
    </span>
  )
}

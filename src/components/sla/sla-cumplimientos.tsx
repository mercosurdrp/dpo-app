"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CalendarClock, CheckCircle2, XCircle, Minus } from "lucide-react"
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
  getCumplimientoRuteo,
  SLA_RUTEO_NOMBRE,
  type CumplimientoRuteoMes,
} from "@/actions/sla"

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

export function SlaCumplimientos({
  inicial,
}: {
  inicial: CumplimientoRuteoMes
}) {
  const [data, setData] = useState<CumplimientoRuteoMes>(inicial)
  const [pending, start] = useTransition()

  const monthValue = `${data.year}-${String(data.month).padStart(2, "0")}`

  function cambiarMes(value: string) {
    const [y, m] = value.split("-").map(Number)
    if (!y || !m) return
    start(async () => {
      const r = await getCumplimientoRuteo(y, m)
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      setData(r.data)
    })
  }

  const pct = data.porcentaje
  const cumpleTarget = pct !== null && pct >= data.target
  const pctColor =
    pct === null
      ? "text-slate-400"
      : cumpleTarget
        ? "text-emerald-600"
        : "text-red-600"

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <CalendarClock className="size-5 text-pink-600" />
            {SLA_RUTEO_NOMBRE}
          </h2>
          <p className="text-sm text-slate-500">
            Cumplimiento diario: ruteo cerrado antes de las <b>09:00</b> (L-V) /{" "}
            <b>07:30</b> (sáb). Fuente: módulo Ruteo.
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

      {/* Métrica mensual */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Cumplimiento del mes</div>
          <div className={`text-3xl font-bold leading-tight ${pctColor}`}>
            {pct === null ? "—" : `${pct}%`}
          </div>
          <div className="text-xs text-slate-400">
            objetivo ≥ {data.target}%
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Días cumplidos</div>
          <div className="text-3xl font-bold leading-tight text-slate-900">
            {data.cumplidos}
            <span className="text-base font-normal text-slate-400">
              {" "}
              / {data.totalAplica}
            </span>
          </div>
          <div className="text-xs text-slate-400">días con ruteo medibles</div>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white px-4 py-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              pct === null
                ? "bg-slate-100 text-slate-500"
                : cumpleTarget
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
            }`}
          >
            {pct === null
              ? "Sin datos"
              : cumpleTarget
                ? "Cumple objetivo"
                : "Bajo objetivo"}
          </span>
        </div>
      </div>

      {/* Tabla día a día */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>Límite</TableHead>
              <TableHead>Fin de ruteo</TableHead>
              <TableHead className="text-right">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.dias.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-slate-400"
                >
                  No hay ruteos registrados en este mes.
                </TableCell>
              </TableRow>
            ) : (
              data.dias.map((d) => (
                <TableRow key={d.fecha}>
                  <TableCell className="tabular-nums">
                    {fechaCorta(d.fecha)}
                  </TableCell>
                  <TableCell className="text-slate-600">{d.diaSemana}</TableCell>
                  <TableCell className="tabular-nums text-slate-600">
                    {d.limite ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-slate-700">
                    {d.horaFin ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <EstadoCelda dia={d} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function EstadoCelda({
  dia,
}: {
  dia: CumplimientoRuteoMes["dias"][number]
}) {
  if (!dia.aplica) {
    return <span className="text-xs text-slate-400">No aplica</span>
  }
  if (dia.cumple === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <Minus className="size-3.5" /> Sin dato
      </span>
    )
  }
  if (dia.cumple) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 className="size-4" /> Cumple
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <XCircle className="size-4" /> No cumple
    </span>
  )
}

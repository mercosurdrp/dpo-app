"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { PackageCheck, CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getRecepcionesAcarreo, type RecepcionFinalizada } from "@/actions/acarreo"
import { SLA_RECEPCION_TARGET } from "@/lib/sla-cumplimiento"

function horaHHmm(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}
function fmtDur(min: number | null): string {
  if (min == null) return "—"
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`
}
function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

export function AcarreoClient({
  inicial,
  errorInicial,
  yearInicial,
  monthInicial,
}: {
  inicial: RecepcionFinalizada[]
  errorInicial: string | null
  yearInicial: number
  monthInicial: number
}) {
  const [rows, setRows] = useState<RecepcionFinalizada[]>(inicial)
  const [error, setError] = useState<string | null>(errorInicial)
  const [year, setYear] = useState(yearInicial)
  const [month, setMonth] = useState(monthInicial)
  const [pending, start] = useTransition()

  const monthValue = `${year}-${String(month).padStart(2, "0")}`

  function cambiarMes(value: string) {
    const [y, m] = value.split("-").map(Number)
    if (!y || !m) return
    setYear(y)
    setMonth(m)
    const desde = `${y}-${String(m).padStart(2, "0")}-01`
    const hastaExcl = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
    const hasta = new Date(new Date(hastaExcl).getTime() - 86400000).toISOString().slice(0, 10)
    start(async () => {
      const r = await getRecepcionesAcarreo(desde, hasta)
      if ("error" in r) {
        setError(r.error)
        setRows([])
        toast.error(r.error)
        return
      }
      setError(null)
      setRows(r.data)
    })
  }

  // Métrica POR RECEPCIÓN: solo las medibles (cumpleSla !== null).
  const medibles = useMemo(() => rows.filter((r) => r.cumpleSla !== null), [rows])
  const cumplidas = useMemo(() => medibles.filter((r) => r.cumpleSla).length, [medibles])
  const pct = medibles.length > 0 ? Math.round((cumplidas / medibles.length) * 100) : null
  const cumpleTarget = pct !== null && pct >= SLA_RECEPCION_TARGET

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <PackageCheck className="size-6 text-pink-600" />
            Recepción de acarreos
          </h1>
          <p className="text-sm text-slate-500">
            Camiones de abastecimiento ya descargados. SLA: arribo <b>08:00–16:00</b> y descarga{" "}
            <b>≤ 2 h</b>. Fuente: app de acarreos (solo lectura).
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

      {/* Resumen mensual */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Cumplimiento del mes</div>
          <div
            className={`text-3xl font-bold leading-tight ${
              pct === null ? "text-slate-400" : cumpleTarget ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {pct === null ? "—" : `${pct}%`}
          </div>
          <div className="text-xs text-slate-400">objetivo ≥ {SLA_RECEPCION_TARGET}%</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Recepciones medidas</div>
          <div className="text-3xl font-bold leading-tight text-slate-900">
            {cumplidas}
            <span className="text-base font-normal text-slate-400"> / {medibles.length}</span>
          </div>
          <div className="text-xs text-slate-400">cumplen ≤ 2 h en ventana 08–16</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs text-slate-500">Total finalizadas</div>
          <div className="text-3xl font-bold leading-tight text-slate-900">{rows.length}</div>
          <div className="text-xs text-slate-400">incluye arribos fuera de 08–16</div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Fecha</TableHead>
                <TableHead>Patente</TableHead>
                <TableHead>Transportista</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Remito</TableHead>
                <TableHead className="text-right">Pallets</TableHead>
                <TableHead>Arribo</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead className="text-right">Estadía</TableHead>
                <TableHead className="text-center">SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-slate-400">
                    No hay recepciones finalizadas en este mes.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{fechaCorta(r.fecha)}</TableCell>
                    <TableCell className="font-medium text-slate-900">{r.patente}</TableCell>
                    <TableCell className="text-slate-600">{r.transportista ?? "—"}</TableCell>
                    <TableCell className="text-slate-600">{r.origen ?? "—"}</TableCell>
                    <TableCell className="text-slate-600">{r.remito ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {r.pallets ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-slate-600">{horaHHmm(r.hora_arribo)}</TableCell>
                    <TableCell className="tabular-nums text-slate-600">
                      {horaHHmm(r.hora_fin_descarga)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-slate-800">
                      {fmtDur(r.estadiaMin)}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.cumpleSla === null ? (
                        <MinusCircle className="mx-auto size-4 text-slate-300" />
                      ) : r.cumpleSla ? (
                        <CheckCircle2 className="mx-auto size-4 text-emerald-600" />
                      ) : (
                        <XCircle className="mx-auto size-4 text-red-600" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

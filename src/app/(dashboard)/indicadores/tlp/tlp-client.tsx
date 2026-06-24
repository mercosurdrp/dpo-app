"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Gauge, Package, Clock, Truck, AlertTriangle, Info, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TlpResumen } from "@/actions/tlp"
import type { TlpPlan } from "@/actions/tlp-planes"
import { PlanesAccionBloque } from "./_components/planes/planes-accion-bloque"
import { TlpRutaDetalleDialog, type RutaFiltro } from "./tlp-ruta-detalle-dialog"

function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number)
  return {
    desde: `${mes}-01`,
    hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  }
}

const fmtN = (n: number, dec = 0) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(n)

const fmtTlp = (v: number | null) => (v == null ? "—" : fmtN(v, 2))

function tlpColor(v: number | null): string {
  if (v == null) return "text-slate-400"
  if (v >= 25) return "text-emerald-700"
  if (v >= 18) return "text-amber-700"
  return "text-red-700"
}

export function TlpClient({
  mes,
  data,
  planesIniciales,
}: {
  mes: string
  data: TlpResumen
  planesIniciales: TlpPlan[]
}) {
  const router = useRouter()
  const t = data.total
  const { desde, hasta } = rangoMes(mes)
  const [rutaFiltro, setRutaFiltro] = useState<RutaFiltro | null>(null)

  // Catálogos para el foco de los planes.
  const ciudades = data.por_ciudad.map((f) => f.ciudad)
  const patentes = data.por_patente.map((f) => f.patente)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            TLP · Transport Labor Productivity
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cajas equivalentes entregadas ÷ horas-hombre en ruta (CEq/HH) — Pilar Entrega 1.3
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Mes
          <input
            type="month"
            value={mes}
            onChange={(e) =>
              e.target.value && router.push(`/indicadores/tlp?mes=${e.target.value}`)
            }
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400"
          />
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icon={<Gauge className="size-5 text-slate-400" />}
          label="TLP del mes"
          value={fmtTlp(t.tlp)}
          sub="CEq por hora-hombre"
          valueClass={tlpColor(t.tlp)}
        />
        <Kpi
          icon={<Package className="size-5 text-slate-400" />}
          label="CEq entregadas"
          value={fmtN(t.ceq)}
          sub={`${fmtN(t.viajes)} viajes`}
        />
        <Kpi
          icon={<Clock className="size-5 text-slate-400" />}
          label="Horas-hombre"
          value={fmtN(t.horas_hombre, 1)}
          sub={`${fmtN(t.horas_ruta, 1)} h en ruta`}
        />
        <Kpi
          icon={<Truck className="size-5 text-slate-400" />}
          label="Viajes con CEq"
          value={fmtN(data.viajes_con_ceq)}
          sub={`${fmtN(data.viajes_sin_tiempo)} sin tiempo de ruta`}
        />
      </div>

      {(data.viajes_sin_tiempo > 0 || data.viajes_fte_fallback > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {data.viajes_sin_tiempo > 0 && (
              <>
                <strong>{fmtN(data.viajes_sin_tiempo)}</strong> viaje
                {data.viajes_sin_tiempo === 1 ? "" : "s"} con CEq pero sin checklist
                de retorno (excluidos del denominador).{" "}
              </>
            )}
            {data.viajes_fte_fallback > 0 && (
              <>
                <strong>{fmtN(data.viajes_fte_fallback)}</strong> viaje
                {data.viajes_fte_fallback === 1 ? "" : "s"} usaron FTE=2 por falta de
                registro de egreso.
              </>
            )}
          </span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setRutaFiltro({ tipo: "all", label: "Todos los viajes" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Info className="size-3.5" />
          ¿Cómo se calculan las horas en ruta?
        </button>
      </div>

      {/* Por ciudad */}
      <TablaTlp
        titulo="Por ciudad"
        labelCol="Ciudad"
        filas={data.por_ciudad.map((f) => ({ label: f.ciudad, ...f }))}
        onRow={(label) => setRutaFiltro({ tipo: "ciudad", valor: label, label })}
      />

      {/* Por camión */}
      <TablaTlp
        titulo="Por camión"
        labelCol="Patente"
        mono
        filas={data.por_patente.map((f) => ({ label: f.patente, ...f }))}
        onRow={(label) => setRutaFiltro({ tipo: "patente", valor: label, label })}
      />

      {/* Planes de acción (foco ciudad / camión) */}
      <PlanesAccionBloque
        planesIniciales={planesIniciales}
        ciudades={ciudades}
        patentes={patentes}
      />

      <TlpRutaDetalleDialog
        open={!!rutaFiltro}
        onClose={() => setRutaFiltro(null)}
        desde={desde}
        hasta={hasta}
        filtro={rutaFiltro}
      />
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  valueClass?: string
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-0.5 text-2xl font-bold tabular-nums ${valueClass ?? "text-slate-900"}`}>
              {value}
            </p>
            <p className="text-[11px] text-muted-foreground">{sub}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  )
}

interface FilaTlp {
  label: string
  ceq: number
  horas_ruta: number
  horas_hombre: number
  viajes: number
  tlp: number | null
}

function TablaTlp({
  titulo,
  labelCol,
  filas,
  mono,
  onRow,
}: {
  titulo: string
  labelCol: string
  filas: FilaTlp[]
  mono?: boolean
  onRow?: (label: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
        {onRow && (
          <span className="text-xs text-muted-foreground">tocá una fila para ver sus horas en ruta</span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labelCol}</TableHead>
                <TableHead className="text-right">CEq</TableHead>
                <TableHead className="text-right">Hs ruta</TableHead>
                <TableHead className="text-right">Hs-hombre</TableHead>
                <TableHead className="text-right">Viajes</TableHead>
                <TableHead className="text-right">TLP</TableHead>
                {onRow && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={onRow ? 7 : 6} className="py-6 text-center text-sm text-muted-foreground">
                    Sin datos para este mes.
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((f) => (
                  <TableRow
                    key={f.label}
                    onClick={onRow ? () => onRow(f.label) : undefined}
                    className={onRow ? "group cursor-pointer hover:bg-slate-50" : undefined}
                  >
                    <TableCell className={mono ? "font-mono text-xs" : "font-medium"}>
                      {f.label}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtN(f.ceq)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-slate-700 group-hover:text-sky-700">{fmtN(f.horas_ruta, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{fmtN(f.horas_hombre, 1)}</TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">{fmtN(f.viajes)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${tlpColor(f.tlp)}`}>
                      {fmtTlp(f.tlp)}
                    </TableCell>
                    {onRow && (
                      <TableCell className="px-2 text-slate-300">
                        <ChevronRight className="size-4 transition-colors group-hover:text-slate-500" />
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

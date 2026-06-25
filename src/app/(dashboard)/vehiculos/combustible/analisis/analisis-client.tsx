"use client"

import { useState, useTransition } from "react"
import { Fuel, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  getAnalisisCombustible,
  type AnalisisCombustible,
  type CombustibleCamion,
} from "@/actions/combustible-analisis"

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]
const nf = new Intl.NumberFormat("es-AR")
const nf2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function mesLargo(mes: string): string {
  const [y, m] = mes.split("-").map((s) => parseInt(s, 10))
  return `${MESES[m - 1] ?? mes} ${y}`
}

/** Color del rendimiento de un camión según su desvío vs la flota. */
function semaforo(desvio: number | null): { label: string; cls: string } {
  if (desvio == null) return { label: "—", cls: "bg-slate-100 text-slate-500" }
  if (desvio >= -3) return { label: "OK", cls: "bg-emerald-100 text-emerald-700" }
  if (desvio >= -10) return { label: "Atención", cls: "bg-amber-100 text-amber-700" }
  return { label: "Crítico", cls: "bg-rose-100 text-rose-700" }
}

export function AnalisisCombustibleClient({ inicial }: { inicial: AnalisisCombustible }) {
  const [data, setData] = useState(inicial)
  const [mes, setMes] = useState(inicial.mes)
  const [cargando, startCarga] = useTransition()

  function cambiarMes(nuevo: string) {
    setMes(nuevo)
    startCarga(async () => {
      const res = await getAnalisisCombustible(nuevo)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setData(res.data)
    })
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Fuel className="mt-1 size-6 shrink-0 text-sky-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">Análisis de Combustible</h1>
            <p className="text-sm text-muted-foreground">
              Consumo, kilómetros y rendimiento (km/l) por camión vs el promedio de
              la flota. Los de peor rendimiento son el foco del plan de acción.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => cambiarMes(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {data.meses_disponibles.map((m) => (
              <option key={m} value={m}>
                {mesLargo(m)}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/api/vehiculos/combustible/pdf?mes=${mes}`, "_blank")}
            disabled={data.camiones.length === 0}
          >
            <FileText className="size-4" /> PDF
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Camiones" valor={nf.format(data.total_camiones)} sub={`${nf.format(data.total_cargas)} cargas`} />
        <Kpi label="Litros cargados" valor={nf.format(data.total_litros)} sub="en el mes" />
        <Kpi label="Km recorridos" valor={nf.format(data.total_km)} sub="con medición" />
        <Kpi
          label="Rendimiento flota"
          valor={data.rendimiento_flota != null ? `${nf2.format(data.rendimiento_flota)} km/l` : "—"}
          sub={data.l_100km_flota != null ? `${nf2.format(data.l_100km_flota)} L/100km` : ""}
          destacado
        />
      </div>

      {/* Tabla por camión */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Consumo por camión {cargando && <Loader2 className="ml-1 inline size-3 animate-spin" />}
          </h3>
          <span className="text-xs text-muted-foreground">peor rendimiento primero</span>
        </div>
        {data.camiones.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay cargas de combustible en {mesLargo(mes)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Camión</th>
                  <th className="px-3 py-2 text-right font-medium">Cargas</th>
                  <th className="px-3 py-2 text-right font-medium">Litros</th>
                  <th className="px-3 py-2 text-right font-medium">Km</th>
                  <th className="px-3 py-2 text-right font-medium">Rend. (km/l)</th>
                  <th className="px-3 py-2 text-right font-medium">L/100km</th>
                  <th className="px-3 py-2 text-right font-medium">vs Flota</th>
                  <th className="px-3 py-2 text-center font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.camiones.map((c) => (
                  <Fila key={c.dominio} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Rendimiento = km ÷ litros (km/l): a mayor número, mejor. Usa solo las cargas con medición de km
        (la 1ª carga de cada camión no la tiene). “vs Flota” compara contra el promedio del mes.
      </p>
    </div>
  )
}

function Fila({ c }: { c: CombustibleCamion }) {
  const s = semaforo(c.desvio_pct)
  return (
    <tr className="border-b last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-2">
        <span className="font-medium text-slate-900">{c.dominio}</span>
        {(c.modelo || c.descripcion) && (
          <span className="ml-1 text-xs text-muted-foreground">{c.modelo || c.descripcion}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.cargas)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.litros)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{nf.format(c.km)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
        {c.rendimiento != null ? nf2.format(c.rendimiento) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
        {c.l_100km != null ? nf2.format(c.l_100km) : "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {c.desvio_pct != null ? (
          <span className={c.desvio_pct < 0 ? "text-rose-700" : "text-emerald-700"}>
            {c.desvio_pct > 0 ? "+" : ""}
            {nf2.format(c.desvio_pct)}%
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <Badge className={`${s.cls} border-0`}>{s.label}</Badge>
      </td>
    </tr>
  )
}

function Kpi({
  label,
  valor,
  sub,
  destacado,
}: {
  label: string
  valor: string
  sub?: string
  destacado?: boolean
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={destacado ? "text-2xl font-bold text-sky-600" : "text-2xl font-bold text-slate-900"}>
        {valor}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

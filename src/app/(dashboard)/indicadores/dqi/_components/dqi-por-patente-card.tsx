"use client"

import { useEffect, useState, useTransition } from "react"
import { Truck, Loader2, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  getDqiPorPatenteRanking,
  type DqiRankingData,
  type DqiPatenteRanking,
} from "@/actions/dqi"

const MESES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

const fmtHL = (n: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtNum = (n: number) => new Intl.NumberFormat("es-AR").format(n)
const fmtPPM = (n: number) => new Intl.NumberFormat("es-AR").format(n)

/** Color del PPM de un camión. Ojo: el target del punto 1.4 hoy NO está cargado
 * (viene null), así que no se puede pintar contra la meta — si el default fuera
 * verde, el peor camión del mes se vería "en verde". Sin meta, la referencia es
 * el DQI general del período: rojo el que entrega peor que el promedio de la
 * operación, verde sólo el que no rompió nada. */
function colorPpm(
  ppm: number | null,
  target: number | null,
  dqiGeneral: number | null,
): string {
  if (ppm == null) return "text-slate-400"
  if (ppm === 0) return "text-emerald-700"
  const ref = target ?? dqiGeneral
  if (ref != null && ppm > ref) return "text-red-600"
  return "text-slate-700"
}

export function DqiPorPatenteCard({
  year,
  month,
  target,
}: {
  year: number
  month: number
  target: number | null
}) {
  /** false = el mes seleccionado arriba; true = el año entero. */
  const [anual, setAnual] = useState(false)
  const [data, setData] = useState<DqiRankingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [sel, setSel] = useState<DqiPatenteRanking | null>(null)

  useEffect(() => {
    startTransition(async () => {
      const res = await getDqiPorPatenteRanking(year, anual ? null : month)
      if ("error" in res) {
        setError(res.error)
        setData(null)
      } else {
        setError(null)
        setData(res.data)
      }
    })
  }, [year, month, anual])

  const periodo = anual ? String(year) : `${MESES_FULL[month - 1]} ${year}`

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-700">
                DQI por camión · {periodo}
              </h2>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            <div className="flex rounded-md border border-slate-200 p-0.5 text-xs">
              <button
                onClick={() => setAnual(false)}
                className={`rounded px-2 py-1 ${!anual ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-700"}`}
              >
                Mes
              </button>
              <button
                onClick={() => setAnual(true)}
                className={`rounded px-2 py-1 ${anual ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-700"}`}
              >
                Año
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {data && data.sin_volumen && (
            <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No se pudo traer el volumen despachado por camión: la tabla muestra los HL rotos, pero
              sin PPM (no son comparables entre camiones de distinto volumen).
            </p>
          )}

          {data && data.filas_sin_patente > 0 && (
            <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {data.filas_sin_patente}{" "}
              {data.filas_sin_patente === 1 ? "movimiento no traía" : "movimientos no traían"} patente
              y {data.filas_sin_patente === 1 ? "cae" : "caen"} en «(sin patente)». Se corrige
              re-subiendo el Detalle de Movimiento en el tablero de pérdidas.
            </p>
          )}

          {data && data.patentes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="px-2 py-2 text-left font-medium">Camión</th>
                    <th className="px-2 py-2 text-right font-medium">HL despachados</th>
                    <th className="px-2 py-2 text-right font-medium">HL rotos</th>
                    <th className="px-2 py-2 text-right font-medium">DQI (PPM)</th>
                    <th className="px-2 py-2 text-right font-medium">% de las roturas</th>
                    <th className="px-2 py-2 text-right font-medium">Faltantes (HL)</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.patentes.map((p) => (
                    <tr
                      key={p.patente}
                      onClick={() => setSel(p)}
                      className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
                    >
                      <td className="px-2 py-2">
                        <span className="font-mono text-slate-700">{p.patente}</span>
                        {p.movil && (
                          <span className="ml-2 text-xs text-slate-400">móvil {p.movil}</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">
                        {p.hl_despachados != null ? fmtHL(p.hl_despachados) : "s/d"}
                        {p.base_chica && (
                          <span
                            className="ml-1 cursor-help text-amber-500"
                            title="Despachó muy poco en el período: con tan poco volumen una sola rotura dispara el PPM. No es comparable con el resto."
                          >
                            *
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-700">
                        {fmtHL(p.roturas.hl)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-mono font-semibold ${colorPpm(
                          p.ppm,
                          target,
                          data.dqi_ppm,
                        )}`}
                      >
                        {p.ppm != null ? fmtPPM(p.ppm) : "s/d"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-500">
                        {p.pct_roturas.toLocaleString("es-AR")}%
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-500">
                        {fmtHL(p.faltantes.hl)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data.dqi_ppm != null && (
                  <tfoot>
                    <tr className="border-t border-slate-200 text-xs font-semibold text-slate-600">
                      <td className="px-2 py-2">Total · DQI del período</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {data.hl_entregados != null ? fmtHL(data.hl_entregados) : "—"}
                        <span className="ml-1 font-sans font-normal text-slate-400">entregados</span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{fmtHL(data.hl_rotos_total)}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmtPPM(data.dqi_ppm)}</td>
                      <td className="px-2 py-2 text-right font-mono">100%</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            !pending &&
            !error && (
              <p className="py-6 text-center text-sm text-slate-400">
                Sin roturas ni faltantes de distribución en {periodo}.
              </p>
            )
          )}

          <p className="mt-3 text-[11px] text-slate-400">
            El DQI general no se recalcula: se reparte. El denominador de cada camión es su parte del
            HL entregado del período, prorrateada por lo que despachó (
            <code>ocupacion_bodega_diaria</code>) — la suma ponderada da exacto el DQI general. Sólo
            las <strong>roturas</strong> entran al PPM; los faltantes son dato de gestión aparte.
            {data?.patentes.some((p) => p.base_chica) && (
              <>
                {" "}
                <span className="text-amber-600">
                  (*) despachó muy poco en el período: su PPM se dispara con una sola rotura y no es
                  comparable con el resto.
                </span>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Detalle por SKU del camión */}
      <Dialog open={sel != null} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[640px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {sel?.patente}
              {sel?.movil && (
                <span className="ml-2 text-sm font-normal text-slate-400">móvil {sel.movil}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              Roturas y faltantes en ruta por SKU · {periodo}
              {sel?.ppm != null && ` · ${fmtPPM(sel.ppm)} PPM`}
            </DialogDescription>
          </DialogHeader>
          {sel && sel.detalle.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-2 py-2 text-left font-medium">SKU</th>
                  <th className="px-2 py-2 text-right font-medium">Rotos (u)</th>
                  <th className="px-2 py-2 text-right font-medium">Rotos (HL)</th>
                  <th className="px-2 py-2 text-right font-medium">Faltantes (u)</th>
                  <th className="px-2 py-2 text-right font-medium">Faltantes (HL)</th>
                </tr>
              </thead>
              <tbody>
                {[...sel.detalle]
                  .sort((a, b) => b.roturas.hl - a.roturas.hl)
                  .map((s) => (
                    <tr key={s.codigo} className="border-b border-slate-50">
                      <td className="px-2 py-2 text-slate-700">
                        <span className="font-mono text-xs text-slate-400">{s.codigo}</span>{" "}
                        {s.descripcion}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">
                        {fmtNum(s.roturas.unidades)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-emerald-700">
                        {fmtHL(s.roturas.hl)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-600">
                        {fmtNum(s.faltantes.unidades)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-500">
                        {fmtHL(s.faltantes.hl)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Sin detalle por SKU.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

"use client"

import { Fragment, useEffect, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Loader2, MapPin, Plus, UserRound } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getDqiAperturas, type DqiAperturasData, type PeriodoApertura } from "@/actions/dqi-aperturas"
import type { FilaApertura } from "@/lib/dqi/aperturas"

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
const PERIODOS: { v: PeriodoApertura; label: string }[] = [
  { v: "3m", label: "Últimos 3 meses" },
  { v: "mes", label: "Mes" },
  { v: "anio", label: "Año" },
]
type Solapa = "chofer" | "dia" | "zona"

const nf = (n: number, d = 0) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: d }).format(n)
const fmtPPM = (n: number | null) => (n == null ? "s/d" : `${nf(n)} PPM`)
const fmtFecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
const titleCase = (s: string) =>
  s.startsWith("(") ? s : s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

function etiquetaPeriodo(d: DqiAperturasData) {
  const ms = d.meses.map((m) => MESES[Number(m.slice(5, 7)) - 1])
  const y = d.meses[d.meses.length - 1].slice(0, 4)
  return ms.length === 1 ? `${ms[0]} ${y}` : `${ms[0]}–${ms[ms.length - 1]} ${y}`
}

/**
 * DQI abierto por chofer, día de la semana y zona. Misma base que la fila DQI de
 * la matinal (roturas en ruta con detalle diario ÷ HL entregado), por eso el
 * total puede no coincidir con la tarjeta mensual de arriba (/api/dqi).
 */
export function DqiAperturasCard({
  year,
  month,
  target,
  onCrearPlan,
}: {
  year: number
  month: number
  target: number | null
  onCrearPlan: (descripcion: string) => void
}) {
  const [periodo, setPeriodo] = useState<PeriodoApertura>("3m")
  const [solapa, setSolapa] = useState<Solapa>("chofer")
  const [res, setRes] = useState<{ key: string; data?: DqiAperturasData; error?: string } | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const key = `${year}-${month}-${periodo}`
  const cargando = res?.key !== key

  useEffect(() => {
    let vivo = true
    getDqiAperturas({ year, month, periodo }).then((r) => {
      if (!vivo) return
      setRes("error" in r ? { key, error: r.error } : { key, data: r.data })
    })
    return () => {
      vivo = false
    }
  }, [year, month, periodo, key])

  const data = !cargando ? res?.data : undefined
  const error = !cargando ? res?.error : undefined
  const fuera = (p: number | null) => target != null && p != null && p > target

  const planDe = (quien: string, f: FilaApertura) => {
    if (!data) return
    onCrearPlan(
      `DQI ${quien}: ${fmtPPM(f.ppm)} en ${etiquetaPeriodo(data)} ` +
        `(${nf(f.hl_rotos, 3)} HL rotos, ${f.eventos} roturas${target != null ? `, meta ${nf(target)} PPM` : ""}).`,
    )
  }

  const botonPlan = (quien: string, f: FilaApertura) =>
    fuera(f.ppm) && !f.base_chica ? (
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-[11px]"
        onClick={(e) => {
          e.stopPropagation()
          planDe(quien, f)
        }}
      >
        <Plus className="mr-1 size-3" /> Plan
      </Button>
    ) : null

  const grafico = (filas: FilaApertura[], horizontal: boolean) => {
    const puntos = filas
      .filter((f) => f.hl_movidos > 0)
      .map((f) => ({ nombre: titleCase(f.nombre), ppm: f.ppm ?? 0, base_chica: f.base_chica }))
    const alto = horizontal ? Math.max(160, puntos.length * 28) : 220
    return (
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={puntos} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 8, right: 24, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 11 }} />
              </>
            ) : (
              <>
                <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
              </>
            )}
            <RTooltip formatter={(v) => [`${nf(Number(v))} PPM`, "DQI"]} />
            {target != null &&
              (horizontal ? (
                <ReferenceLine x={target} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Meta ${target}`, fontSize: 10, fill: "#ef4444", position: "top" }} />
              ) : (
                <ReferenceLine y={target} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Meta ${target}`, fontSize: 10, fill: "#ef4444", position: "right" }} />
              ))}
            <Bar dataKey="ppm" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
              {puntos.map((p, i) => (
                <Cell
                  key={i}
                  fill={target != null && p.ppm > target ? "#dc2626" : "#059669"}
                  fillOpacity={p.base_chica ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const celdaPpm = (f: FilaApertura) => (
    <span className={`font-semibold ${f.ppm == null ? "text-slate-400" : fuera(f.ppm) ? "text-red-600" : "text-emerald-700"}`}>
      {fmtPPM(f.ppm)}
      {f.base_chica && (
        <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700" title="Movió menos de un tercio del promedio: una sola rotura le dispara el PPM">
          base chica
        </span>
      )}
    </span>
  )

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700">DQI por chofer, día y zona</h2>
          {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <div className="ml-auto flex rounded-md border border-slate-200 p-0.5">
            {PERIODOS.map((p) => (
              <button
                key={p.v}
                onClick={() => setPeriodo(p.v)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  periodo === p.v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="py-4 text-sm text-red-600">{error}</p>}

        {data && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {etiquetaPeriodo(data)} · DQI <b className={fuera(data.total.ppm) ? "text-red-600" : "text-emerald-700"}>{fmtPPM(data.total.ppm)}</b>
              {target != null ? ` (meta ${nf(target)})` : ""} · {data.total.eventos} roturas en ruta, {nf(data.total.hl_rotos, 3)} HL ·
              chofer identificado en el {nf(data.cobertura.pct_hl_con_chofer, 1)} % y zona en el{" "}
              {nf(data.cobertura.pct_hl_con_zona, 1)} % del HL roto. Base: roturas en ruta con detalle diario (la misma de la
              matinal), puede diferir de la tarjeta mensual.
              {data.meses_sin_dato.length > 0 && (
                <span className="ml-1 inline-flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> sin datos del tablero: {data.meses_sin_dato.join(", ")}
                </span>
              )}
            </p>

            <div className="mb-3 flex gap-1 border-b">
              {(
                [
                  { v: "chofer", label: "Chofer", icon: UserRound },
                  { v: "dia", label: "Día de la semana", icon: CalendarDays },
                  { v: "zona", label: "Zona", icon: MapPin },
                ] as const
              ).map((s) => (
                <button
                  key={s.v}
                  onClick={() => setSolapa(s.v)}
                  className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm ${
                    solapa === s.v ? "border-slate-900 font-semibold text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <s.icon className="h-3.5 w-3.5" /> {s.label}
                </button>
              ))}
            </div>

            {solapa === "chofer" && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">Chofer</th>
                      <th className="py-2 pr-2 text-right">DQI</th>
                      <th className="py-2 pr-2 text-right">HL movidos</th>
                      <th className="py-2 pr-2 text-right">HL rotos</th>
                      <th className="py-2 pr-2 text-right">Roturas</th>
                      <th className="py-2 pr-2 text-right">Días</th>
                      <th className="py-2 pr-2 text-right">% del roto</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.choferes.map((f) => {
                      const open = abierto === f.clave
                      return (
                        <Fragment key={f.clave}>
                          <tr
                            className={`border-b ${f.eventos ? "cursor-pointer hover:bg-slate-50" : ""} ${open ? "bg-slate-50" : ""}`}
                            onClick={() => f.eventos && setAbierto(open ? null : f.clave)}
                          >
                            <td className="py-2 pr-2 text-slate-800">
                              <span className="inline-flex items-center gap-1">
                                {f.eventos ? (
                                  open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="w-3.5" />
                                )}
                                {titleCase(f.nombre)}
                              </span>
                            </td>
                            <td className="py-2 pr-2 text-right">{celdaPpm(f)}</td>
                            <td className="py-2 pr-2 text-right text-slate-600">{nf(f.hl_movidos)}</td>
                            <td className="py-2 pr-2 text-right text-slate-600">{nf(f.hl_rotos, 3)}</td>
                            <td className="py-2 pr-2 text-right text-slate-600">{f.eventos}</td>
                            <td className="py-2 pr-2 text-right text-slate-600">{f.dias}</td>
                            <td className="py-2 pr-2 text-right text-slate-600">{nf(f.pct_roturas, 1)} %</td>
                            <td className="py-2 text-right">
                              {botonPlan(`chofer ${titleCase(f.nombre)}`, f)}
                            </td>
                          </tr>
                          {open && f.detalle && (
                            <tr className="border-b bg-slate-50/60">
                              <td colSpan={8} className="px-6 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-slate-500">
                                      <th className="py-1 pr-2">Fecha</th>
                                      <th className="py-1 pr-2">Día</th>
                                      <th className="py-1 pr-2">Patente</th>
                                      <th className="py-1 pr-2">SKU</th>
                                      <th className="py-1 text-right">HL</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {f.detalle.map((r, i) => (
                                      <tr key={i} className="border-t border-slate-100">
                                        <td className="py-1 pr-2">{fmtFecha(r.fecha)}</td>
                                        <td className="py-1 pr-2">{r.dia}</td>
                                        <td className="py-1 pr-2 font-mono">{r.patente}</td>
                                        <td className="py-1 pr-2">{r.descripcion || r.sku}</td>
                                        <td className="py-1 text-right">{nf(r.hl, 4)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Cada rotura va al chofer que salió con ese camión ese día según portería. «Sin chofer» = el camión no tiene
                  egreso registrado ese día. Hacé clic en un chofer para ver sus roturas.
                </p>
              </div>
            )}

            {solapa === "dia" && (
              <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                {grafico(data.dias_semana, false)}
                <table className="w-full self-start text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">Día</th>
                      <th className="py-2 pr-2 text-right">DQI</th>
                      <th className="py-2 pr-2 text-right">Días</th>
                      <th className="py-2 pr-2 text-right">Con rotura</th>
                      <th className="py-2 pr-2 text-right">Roturas</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.dias_semana.map((f) => (
                      <tr key={f.clave} className="border-b">
                        <td className="py-2 pr-2 text-slate-800">{f.nombre}</td>
                        <td className="py-2 pr-2 text-right">{celdaPpm(f)}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{f.dias}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{f.dias_con_rotura ?? 0}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{f.eventos}</td>
                        <td className="py-2 text-right">
                          {botonPlan(`día ${f.nombre}`, f)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {solapa === "zona" && (
              <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
                {grafico(data.zonas, true)}
                <table className="w-full self-start text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-2">Zona</th>
                      <th className="py-2 pr-2 text-right">DQI</th>
                      <th className="py-2 pr-2 text-right">HL movidos</th>
                      <th className="py-2 pr-2 text-right">Roturas</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.zonas.map((f) => (
                      <tr key={f.clave} className="border-b">
                        <td className="py-2 pr-2 text-slate-800">{titleCase(f.nombre)}</td>
                        <td className="py-2 pr-2 text-right">{celdaPpm(f)}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{nf(f.hl_movidos)}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{f.eventos}</td>
                        <td className="py-2 text-right">
                          {botonPlan(`zona ${titleCase(f.nombre)}`, f)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground lg:col-span-2">
                  Cada camión-día va a la localidad donde entregó más HL ese día (ocupación de bodega).
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
